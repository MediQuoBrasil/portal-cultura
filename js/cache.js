/**
 * @file cache.js
 * Cache local persistente: IndexedDB (assíncrono, primário) com fallback para localStorage
 * quando o IndexedDB estiver indisponível (desempenho.md §6). Um espelho em memória evita
 * reler o IndexedDB na mesma sessão.
 *
 * Garantias:
 * - só grava chaves de ações na allowlist `POLITICA_CACHE` (dado de nível 3 nunca persiste);
 * - `VERSAO_CACHE` diferente descarta tudo (mudança de formato não corrompe leitura);
 * - falha de storage nunca derruba a tela: vira cache miss e log.
 *
 * Formato da chave: `<acao>|<payload canônico>`; metadados: `meta|<nome>`.
 */

import { CONFIG, POLITICA_CACHE } from './config.js';
import { logAviso, logDebug } from './log.js';
import { serializarEstavel } from './util.js';

const NOME_BANCO = 'portal-cultura';
const NOME_STORE = 'entradas';
const PREFIXO_LS = `pc:c:${CONFIG.VERSAO_CACHE}:`;
const TIMEOUT_ABERTURA_MS = 3000;
const PREFIXO_META = 'meta';

/**
 * @typedef {Object} Registro
 * @property {string} chave
 * @property {*} valor
 * @property {number} ts Epoch ms da gravação.
 * @property {number} ttl ms; 0 = sem expiração (metadados).
 */

/**
 * @typedef {Object} Adaptador
 * @property {'indexeddb'|'localstorage'|'nenhum'} nome
 * @property {function(string): Promise<?Registro>} ler
 * @property {function(Array<Registro>): Promise<void>} gravar
 * @property {function(function(string): boolean): Promise<void>} removerOnde
 * @property {function(): Promise<void>} limpar
 */

/**
 * @typedef {Object} LeituraCache
 * @property {*} valor
 * @property {boolean} stale true = servir e revalidar em segundo plano.
 */

/** @type {Map<string, Registro>} */
const memoria = new Map();

/** @type {?Promise<Adaptador>} */
let adaptadorPromessa = null;

/** Sinal global "nada mudou" (check_update): suprime a revalidação do SWR. */
let todosFrescos = false;

// ─── Adaptador IndexedDB ─────────────────────────────────────

/**
 * @param {IDBRequest} requisicao Requisição IDB.
 * @returns {Promise<*>} Resultado.
 */
const aguardarRequisicao = (requisicao) => new Promise((resolve, reject) => {
  requisicao.addEventListener('success', () => resolve(requisicao.result));
  requisicao.addEventListener('error', () => reject(requisicao.error));
});

/**
 * @param {IDBTransaction} transacao Transação.
 * @returns {Promise<void>} Resolve no `complete`.
 */
const aguardarTransacao = (transacao) => new Promise((resolve, reject) => {
  transacao.addEventListener('complete', () => resolve());
  transacao.addEventListener('error', () => reject(transacao.error));
  transacao.addEventListener('abort', () => reject(transacao.error || new Error('transação abortada')));
});

/**
 * Abre o banco; a versão do IDB acompanha `VERSAO_CACHE` e o upgrade recria o store.
 * @returns {Promise<IDBDatabase>} Banco aberto.
 */
const abrirBanco = () => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) {
    reject(new Error('indexeddb_indisponivel'));
    return;
  }
  const temporizador = setTimeout(() => reject(new Error('indexeddb_timeout')), TIMEOUT_ABERTURA_MS);
  const requisicao = indexedDB.open(NOME_BANCO, CONFIG.VERSAO_CACHE);
  requisicao.addEventListener('upgradeneeded', () => {
    const banco = requisicao.result;
    if (banco.objectStoreNames.contains(NOME_STORE)) banco.deleteObjectStore(NOME_STORE);
    banco.createObjectStore(NOME_STORE, { keyPath: 'chave' });
  });
  requisicao.addEventListener('success', () => {
    clearTimeout(temporizador);
    resolve(requisicao.result);
  });
  requisicao.addEventListener('error', () => {
    clearTimeout(temporizador);
    reject(requisicao.error || new Error('indexeddb_erro'));
  });
  requisicao.addEventListener('blocked', () => {
    clearTimeout(temporizador);
    reject(new Error('indexeddb_bloqueado'));
  });
});

/**
 * @param {IDBDatabase} banco Banco aberto.
 * @returns {Adaptador} Adaptador IndexedDB.
 */
const criarAdaptadorIdb = (banco) => ({
  nome: 'indexeddb',
  ler: async (chave) => {
    const store = banco.transaction(NOME_STORE, 'readonly').objectStore(NOME_STORE);
    return (await aguardarRequisicao(store.get(chave))) || null;
  },
  gravar: async (registros) => {
    const transacao = banco.transaction(NOME_STORE, 'readwrite');
    const store = transacao.objectStore(NOME_STORE);
    registros.forEach((r) => store.put(r));
    await aguardarTransacao(transacao);
  },
  removerOnde: async (predicado) => {
    const transacao = banco.transaction(NOME_STORE, 'readwrite');
    const store = transacao.objectStore(NOME_STORE);
    const chaves = await aguardarRequisicao(store.getAllKeys());
    chaves.filter((c) => predicado(String(c))).forEach((c) => store.delete(c));
    await aguardarTransacao(transacao);
  },
  limpar: async () => {
    const transacao = banco.transaction(NOME_STORE, 'readwrite');
    transacao.objectStore(NOME_STORE).clear();
    await aguardarTransacao(transacao);
  },
});

// ─── Adaptador localStorage (fallback) ───────────────────────

/** @returns {Array<string>} Chaves do localStorage deste portal (qualquer versão). */
const chavesLocalStorage = () => Array
  .from({ length: localStorage.length }, (_, i) => localStorage.key(i))
  .filter((k) => typeof k === 'string' && k.startsWith('pc:c:'));

/** @returns {Adaptador} Adaptador localStorage (síncrono por baixo, API assíncrona). */
const criarAdaptadorLs = () => {
  chavesLocalStorage()
    .filter((k) => !k.startsWith(PREFIXO_LS))
    .forEach((k) => localStorage.removeItem(k));
  return {
    nome: 'localstorage',
    ler: async (chave) => {
      const bruto = localStorage.getItem(PREFIXO_LS + chave);
      return bruto ? JSON.parse(bruto) : null;
    },
    gravar: async (registros) => {
      registros.forEach((r) => localStorage.setItem(PREFIXO_LS + r.chave, JSON.stringify(r)));
    },
    removerOnde: async (predicado) => {
      chavesLocalStorage()
        .filter((k) => k.startsWith(PREFIXO_LS) && predicado(k.slice(PREFIXO_LS.length)))
        .forEach((k) => localStorage.removeItem(k));
    },
    limpar: async () => {
      chavesLocalStorage().forEach((k) => localStorage.removeItem(k));
    },
  };
};

/** @type {Adaptador} Sem storage: só a memória da página. */
const ADAPTADOR_NULO = Object.freeze({
  nome: 'nenhum',
  ler: async () => null,
  gravar: async () => {},
  removerOnde: async () => {},
  limpar: async () => {},
});

/** @returns {Promise<Adaptador>} Adaptador escolhido (uma vez por página). */
const obterAdaptador = () => {
  if (!adaptadorPromessa) {
    adaptadorPromessa = abrirBanco()
      .then(criarAdaptadorIdb)
      .catch((erro) => {
        logAviso('cache_indexeddb_indisponivel', { motivo: erro instanceof Error ? erro.message : 'desconhecido' });
        try {
          return criarAdaptadorLs();
        } catch (erroLs) {
          logAviso('cache_localstorage_indisponivel', { motivo: erroLs instanceof Error ? erroLs.name : 'desconhecido' });
          return ADAPTADOR_NULO;
        }
      })
      .then((adaptador) => {
        logDebug('cache_adaptador', { nome: adaptador.nome });
        return adaptador;
      });
  }
  return adaptadorPromessa;
};

// ─── API pública ─────────────────────────────────────────────

/**
 * @param {string} acao Ação da API.
 * @param {Object} [payload] Payload.
 * @returns {string} Chave canônica.
 */
export const chaveDe = (acao, payload = {}) => `${acao}|${serializarEstavel(payload)}`;

/**
 * @param {string} chave Chave.
 * @returns {boolean} true se a chave pode ir para o storage persistente.
 */
const podePersistir = (chave) => {
  const acao = chave.split('|')[0];
  return acao === PREFIXO_META || Object.prototype.hasOwnProperty.call(POLITICA_CACHE, acao);
};

/**
 * @param {boolean} valor true após `check_update` sem mudança; false após qualquer escrita.
 * @returns {void}
 */
export const definirTodosFrescos = (valor) => {
  todosFrescos = valor === true;
};

/**
 * Lê uma entrada. Nunca lança: falha de storage = miss.
 * @param {string} chave Chave.
 * @returns {Promise<?LeituraCache>} Valor + staleness, ou null.
 */
export const lerCache = async (chave) => {
  try {
    let registro = memoria.get(chave) || null;
    if (!registro) {
      registro = await (await obterAdaptador()).ler(chave);
      if (registro) memoria.set(chave, registro);
    }
    if (!registro) return null;
    const expirado = registro.ttl > 0 && Date.now() - registro.ts > registro.ttl;
    return { valor: registro.valor, stale: todosFrescos ? false : expirado };
  } catch (erro) {
    logAviso('cache_leitura_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
    return null;
  }
};

/**
 * Grava várias entradas numa transação. Chaves fora da allowlist são descartadas.
 * @param {Array<{chave: string, valor: *, ttl: number}>} entradas Entradas.
 * @returns {Promise<void>} Resolve mesmo em falha (logada).
 */
export const gravarVarios = async (entradas) => {
  const agora = Date.now();
  const registros = entradas
    .filter((e) => {
      const ok = podePersistir(e.chave);
      if (!ok) logAviso('cache_gravacao_recusada', { acao: e.chave.split('|')[0] });
      return ok;
    })
    .map((e) => ({
      chave: e.chave, valor: e.valor, ts: agora, ttl: e.ttl,
    }));
  if (registros.length === 0) return;
  registros.forEach((r) => memoria.set(r.chave, r));
  try {
    await (await obterAdaptador()).gravar(registros);
  } catch (erro) {
    logAviso('cache_gravacao_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
  }
};

/**
 * @param {string} chave Chave.
 * @param {*} valor Valor serializável.
 * @param {number} ttl TTL em ms (0 = sem expiração).
 * @returns {Promise<void>} Resolve mesmo em falha.
 */
export const gravarCache = (chave, valor, ttl) => gravarVarios([{ chave, valor, ttl }]);

/**
 * Remove todas as chaves das ações indicadas (mapa de invalidação).
 * @param {ReadonlyArray<string>} acoes Ações.
 * @returns {Promise<void>} Resolve mesmo em falha.
 */
export const invalidarAcoes = async (acoes) => {
  if (acoes.length === 0) return;
  const prefixos = acoes.map((a) => `${a}|`);
  const casa = (chave) => prefixos.some((p) => chave.startsWith(p));
  Array.from(memoria.keys()).filter(casa).forEach((c) => memoria.delete(c));
  try {
    await (await obterAdaptador()).removerOnde(casa);
  } catch (erro) {
    logAviso('cache_invalidacao_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
  }
};

/**
 * Apaga todo o cache local (logout ou troca de conta).
 * @returns {Promise<void>} Resolve mesmo em falha.
 */
export const limparCache = async () => {
  memoria.clear();
  todosFrescos = false;
  try {
    await (await obterAdaptador()).limpar();
  } catch (erro) {
    logAviso('cache_limpeza_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
  }
};

/**
 * @param {string} nome Nome do metadado.
 * @returns {Promise<*>} Valor ou null.
 */
export const lerMeta = async (nome) => {
  const leitura = await lerCache(`${PREFIXO_META}|${nome}`);
  return leitura ? leitura.valor : null;
};

/**
 * @param {string} nome Nome do metadado.
 * @param {*} valor Valor serializável.
 * @returns {Promise<void>} Resolve mesmo em falha.
 */
export const gravarMeta = (nome, valor) => gravarCache(`${PREFIXO_META}|${nome}`, valor, 0);
