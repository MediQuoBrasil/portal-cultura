/**
 * @file api.js
 * Transporte para o Web App do Apps Script (setup.md §4).
 *
 * - Anti-CORS: POST `text/plain` com JSON no corpo; sem headers customizados → sem preflight.
 * - Envelope único `{ok, data}` / `{ok:false, error}`; o status vem no corpo.
 * - Leituras: single-flight (chamadas idênticas concorrentes compartilham a rede), cache SWR
 *   só para ações da allowlist, retry limitado em falha transitória, timeout folgado (45 s).
 * - Escritas: nunca coalescidas; retry SÓ em `INDISPONIVEL` (o servidor declarou que não
 *   gravou — ex.: trava ocupada). Falha de rede/timeout em escrita NÃO é repetida: o resultado
 *   é desconhecido e repetir poderia duplicar.
 * - Login (`bootstrap` em modo login): tentativa única, 30 s, sem retry (desempenho.md §9.5).
 * - Token expirado: renova UMA vez pelo GIS e repete; se não der, emite `sessao:expirada`.
 * - Logs só com ação, duração, código e `cid` — nunca payload, token ou identidade.
 */

import {
  CONFIG, MAPA_INVALIDACAO, POLITICA_CACHE,
} from './config.js';
import {
  chaveDe, definirTodosFrescos, gravarCache, invalidarAcoes, lerCache,
} from './cache.js';
import { emitir } from './eventos.js';
import { logAviso, logErro, logInfo } from './log.js';
import { tokenUtilizavel } from './sessao.js';
import {
  aguardar, calcularBackoff, ehObjeto, serializarEstavel,
} from './util.js';

/**
 * @typedef {Object} DadosErroApi
 * @property {string} codigo Código do backend ou local (REDE, TEMPO_ESGOTADO, RESPOSTA_INVALIDA).
 * @property {number} status Status HTTP equivalente.
 * @property {string} mensagem Mensagem segura para exibir.
 * @property {string} [cid] Correlation ID do backend.
 */

/** Erro da API com mensagem segura para a UI (nunca stack ou detalhe interno). */
export class ErroApi extends Error {
  /** @param {DadosErroApi} dados Dados do erro. */
  constructor({
    codigo, status, mensagem, cid = '',
  }) {
    super(mensagem);
    this.name = 'ErroApi';
    /** @type {string} */
    this.codigo = codigo;
    /** @type {number} */
    this.status = status;
    /** @type {string} */
    this.cid = cid;
  }
}

/** Mensagens dos erros gerados no próprio cliente. */
const MENSAGENS_LOCAIS = Object.freeze({
  REDE: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
  TEMPO_ESGOTADO: 'O servidor demorou para responder. Tente de novo em instantes.',
  RESPOSTA_INVALIDA: 'O servidor respondeu de forma inesperada. Tente de novo em instantes.',
  NAO_AUTENTICADO: 'Sua sessão expirou. Entre de novo para continuar.',
  CORPO_GRANDE: 'O conteúdo enviado é grande demais.',
});

/** Leituras repetem em falha de rede, resposta não-JSON (página de erro do Google) e 503. */
const TRANSITORIOS_LEITURA = new Set(['REDE', 'RESPOSTA_INVALIDA', 'INDISPONIVEL']);
/** Escritas repetem só quando o servidor garante que nada foi gravado. */
const TRANSITORIOS_ESCRITA = new Set(['INDISPONIVEL']);

/** @type {?function(): Promise<boolean>} Renova o ID token (injetado por auth.js). */
let renovadorToken = null;

/** @type {Map<string, Promise<*>>} Leituras em voo (single-flight). */
const leiturasEmVoo = new Map();

/**
 * @param {string} codigo Código local.
 * @param {number} status Status equivalente.
 * @returns {ErroApi} Erro local.
 */
const erroLocal = (codigo, status) => new ErroApi({
  codigo, status, mensagem: MENSAGENS_LOCAIS[codigo],
});

/**
 * Injeta a função de renovação de token (evita dependência circular api ↔ auth).
 * @param {function(): Promise<boolean>} funcao Resolve true se um novo token foi salvo.
 * @returns {void}
 */
export const definirRenovadorToken = (funcao) => {
  renovadorToken = typeof funcao === 'function' ? funcao : null;
};

/**
 * Valida o envelope e devolve `data` ou lança o erro do servidor.
 * @param {string} texto Corpo da resposta.
 * @returns {*} `data` do envelope.
 * @throws {ErroApi}
 */
const abrirEnvelope = (texto) => {
  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch (erro) {
    throw erroLocal('RESPOSTA_INVALIDA', 502);
  }
  if (!ehObjeto(corpo) || typeof corpo.ok !== 'boolean') throw erroLocal('RESPOSTA_INVALIDA', 502);
  if (corpo.ok) {
    if (!Object.prototype.hasOwnProperty.call(corpo, 'data')) throw erroLocal('RESPOSTA_INVALIDA', 502);
    return corpo.data;
  }
  const e = corpo.error;
  if (!ehObjeto(e) || typeof e.codigo !== 'string' || typeof e.mensagem !== 'string') {
    throw erroLocal('RESPOSTA_INVALIDA', 502);
  }
  throw new ErroApi({
    codigo: e.codigo,
    status: Number.isFinite(e.status) ? e.status : 500,
    mensagem: e.mensagem,
    cid: typeof e.cid === 'string' ? e.cid : '',
  });
};

/**
 * Executa um fetch com timeout e converte falhas de transporte em ErroApi.
 * @param {string} acao Ação (só para log).
 * @param {string} url URL.
 * @param {RequestInit} opcoes Opções do fetch (sem signal).
 * @param {number} timeoutMs Timeout.
 * @returns {Promise<*>} `data` do envelope.
 */
const buscarEnvelope = async (acao, url, opcoes, timeoutMs) => {
  if (globalThis.navigator && navigator.onLine === false) throw erroLocal('REDE', 0);
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  const inicio = performance.now();
  try {
    const resposta = await fetch(url, {
      ...opcoes, credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: controlador.signal,
    });
    const data = abrirEnvelope(await resposta.text());
    logInfo('api_ok', { acao, ms: Math.round(performance.now() - inicio) });
    return data;
  } catch (erro) {
    const ms = Math.round(performance.now() - inicio);
    if (erro instanceof ErroApi) {
      logAviso('api_erro', {
        acao, codigo: erro.codigo, status: erro.status, cid: erro.cid, ms,
      });
      throw erro;
    }
    const codigo = erro instanceof DOMException && erro.name === 'AbortError' ? 'TEMPO_ESGOTADO' : 'REDE';
    logAviso('api_falha_transporte', { acao, codigo, ms });
    throw erroLocal(codigo, codigo === 'REDE' ? 0 : 504);
  } finally {
    clearTimeout(temporizador);
  }
};

/**
 * POST anti-CORS para uma ação.
 * @param {string} acao Ação.
 * @param {Object} payload Payload.
 * @param {?string} token ID token (null em rotas públicas).
 * @param {number} timeoutMs Timeout.
 * @returns {Promise<*>} `data`.
 */
const postar = (acao, payload, token, timeoutMs) => {
  const corpo = JSON.stringify({ action: acao, token: token || undefined, payload });
  if (corpo.length > CONFIG.CORPO_MAX_CHARS) return Promise.reject(erroLocal('CORPO_GRANDE', 413));
  return buscarEnvelope(acao, CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: corpo,
  }, timeoutMs);
};

/**
 * Tenta renovar o token sem lançar.
 * @returns {Promise<boolean>} true se um novo token foi salvo.
 */
const tentarRenovar = async () => {
  if (!renovadorToken) return false;
  try {
    return (await renovadorToken()) === true;
  } catch (erro) {
    logErro('token_renovacao_falhou', erro);
    return false;
  }
};

/**
 * Token válido (renovando antes do `exp` quando possível).
 * @returns {Promise<string>} Token.
 * @throws {ErroApi} NAO_AUTENTICADO.
 */
const obterToken = async () => {
  const comMargem = tokenUtilizavel(CONFIG.TOKEN_MARGEM_MS);
  if (comMargem) return comMargem;
  if (await tentarRenovar()) {
    const renovado = tokenUtilizavel(0);
    if (renovado) return renovado;
  }
  const ultimoRecurso = tokenUtilizavel(0);
  if (ultimoRecurso) return ultimoRecurso;
  throw erroLocal('NAO_AUTENTICADO', 401);
};

/**
 * Chamada autenticada; em NAO_AUTENTICADO renova uma única vez e repete.
 * @param {string} acao Ação.
 * @param {Object} payload Payload.
 * @param {number} timeoutMs Timeout.
 * @returns {Promise<*>} `data`.
 */
const chamarAutenticado = async (acao, payload, timeoutMs) => {
  try {
    try {
      return await postar(acao, payload, await obterToken(), timeoutMs);
    } catch (erro) {
      if (!(erro instanceof ErroApi) || erro.codigo !== 'NAO_AUTENTICADO') throw erro;
      if (!(await tentarRenovar())) throw erro;
      logInfo('api_repete_apos_renovacao', { acao });
      return await postar(acao, payload, tokenUtilizavel(0), timeoutMs);
    }
  } catch (erro) {
    if (erro instanceof ErroApi && erro.codigo === 'NAO_AUTENTICADO') emitir('sessao:expirada', { acao });
    throw erro;
  }
};

/**
 * @typedef {Object} OpcoesRetry
 * @property {string} acao Ação (log).
 * @property {number} maximo Novas tentativas além da primeira.
 * @property {Set<string>} transitorios Códigos que justificam repetir.
 */

/**
 * Executa com novas tentativas limitadas, backoff exponencial e jitter (recursivo, sem
 * `await` em laço).
 * @param {function(): Promise<*>} executar Operação.
 * @param {OpcoesRetry} opcoes Política.
 * @param {number} [tentativa=0] Tentativas já refeitas.
 * @returns {Promise<*>} Resultado.
 */
const comRetry = async (executar, opcoes, tentativa = 0) => {
  try {
    return await executar();
  } catch (erro) {
    const transitorio = erro instanceof ErroApi && opcoes.transitorios.has(erro.codigo);
    if (!transitorio || tentativa >= opcoes.maximo) {
      if (tentativa > 0) logAviso('api_retry_esgotado', { acao: opcoes.acao, tentativas: tentativa + 1 });
      throw erro;
    }
    const esperaMs = calcularBackoff(tentativa + 1, CONFIG.RETRY.BASE_MS, CONFIG.RETRY.TETO_MS);
    logAviso('api_retry', {
      acao: opcoes.acao,
      tentativa: tentativa + 1,
      maximo: opcoes.maximo,
      codigo: erro.codigo,
      esperaMs,
    });
    await aguardar(esperaMs);
    return comRetry(executar, opcoes, tentativa + 1);
  }
};

/**
 * Leitura de rede com single-flight + retry.
 * @param {string} acao Ação.
 * @param {Object} payload Payload.
 * @returns {Promise<*>} `data`.
 */
const lerDaRede = (acao, payload) => {
  const chave = `${acao}|${serializarEstavel(payload)}`;
  const emVoo = leiturasEmVoo.get(chave);
  if (emVoo) return emVoo;
  const promessa = comRetry(
    () => chamarAutenticado(acao, payload, CONFIG.TIMEOUT_LEITURA_MS),
    { acao, maximo: CONFIG.RETRY.LEITURA_MAX, transitorios: TRANSITORIOS_LEITURA },
  ).finally(() => leiturasEmVoo.delete(chave));
  leiturasEmVoo.set(chave, promessa);
  return promessa;
};

/**
 * Revalidação em segundo plano (SWR). Falha é só logada: o dado em tela continua válido.
 * @param {string} acao Ação.
 * @param {Object} payload Payload.
 * @param {number} ttl TTL.
 * @returns {void}
 */
const revalidarEmSegundoPlano = (acao, payload, ttl) => {
  lerDaRede(acao, payload)
    .then(async (data) => {
      await gravarCache(chaveDe(acao, payload), { ok: true, data }, ttl);
      emitir('cache:revalidado', { acao, payload, data });
    })
    .catch((erro) => logAviso('swr_revalidacao_falhou', { acao, codigo: erro && erro.codigo }));
};

/** @type {Map<string, Promise<*>>} Leituras via cache em voo (cobre a janela da leitura do IDB). */
const leiturasComCacheEmVoo = new Map();

/**
 * Cache → rede → grava. Separado de `ler` para o single-flight envolver a operação inteira.
 * @param {string} acao Ação.
 * @param {Object} payload Payload.
 * @param {string} chave Chave canônica.
 * @param {number} ttl TTL da ação (NaN = não persistível).
 * @param {boolean} forcarRede Ignora o cache na leitura.
 * @returns {Promise<*>} `data`.
 */
const lerComCache = async (acao, payload, chave, ttl, forcarRede) => {
  const persistivel = Number.isFinite(ttl);
  if (persistivel && !forcarRede) {
    const cacheado = await lerCache(chave);
    if (cacheado && ehObjeto(cacheado.valor) && cacheado.valor.ok === true) {
      if (cacheado.stale) revalidarEmSegundoPlano(acao, payload, ttl);
      return cacheado.valor.data;
    }
  }
  const data = await lerDaRede(acao, payload);
  if (persistivel) await gravarCache(chave, { ok: true, data }, ttl);
  return data;
};

/**
 * Leitura autenticada com cache SWR para ações da allowlist `POLITICA_CACHE`.
 * Ações fora da allowlist (nível 3) vão sempre à rede e nunca são gravadas.
 * Single-flight sobre a operação inteira: duas leituras iguais concorrentes nunca disparam
 * duas redes, mesmo quando o IndexedDB demora a responder o miss.
 * @param {string} acao Ação.
 * @param {Object} [payload={}] Payload.
 * @param {{forcarRede?: boolean}} [opcoes] `forcarRede` ignora o cache (mas grava o resultado).
 * @returns {Promise<*>} `data`.
 */
export const ler = (acao, payload = {}, { forcarRede = false } = {}) => {
  const chave = chaveDe(acao, payload);
  const chaveVoo = `${forcarRede ? 'rede' : 'cache'}:${chave}`;
  const emVoo = leiturasComCacheEmVoo.get(chaveVoo);
  if (emVoo) return emVoo;
  const promessa = lerComCache(acao, payload, chave, POLITICA_CACHE[acao], forcarRede)
    .finally(() => leiturasComCacheEmVoo.delete(chaveVoo));
  leiturasComCacheEmVoo.set(chaveVoo, promessa);
  return promessa;
};

/**
 * Escrita autenticada. Após sucesso: desliga o "tudo fresco" e aplica o mapa de invalidação.
 * Ação de escrita fora do mapa invalida todo o cache persistível (falha segura → dado fresco).
 * @param {string} acao Ação.
 * @param {Object} [payload={}] Payload.
 * @param {{timeoutMs?: number}} [opcoes] Timeout específico (ex.: upload).
 * @returns {Promise<*>} `data`.
 */
export const escrever = async (
  acao,
  payload = {},
  { timeoutMs = CONFIG.TIMEOUT_ESCRITA_MS } = {},
) => {
  const data = await comRetry(
    () => chamarAutenticado(acao, payload, timeoutMs),
    { acao, maximo: CONFIG.RETRY.ESCRITA_MAX, transitorios: TRANSITORIOS_ESCRITA },
  );
  definirTodosFrescos(false);
  const alvos = MAPA_INVALIDACAO[acao];
  if (!alvos) logAviso('invalidacao_sem_mapa', { acao });
  await invalidarAcoes(alvos || Object.keys(POLITICA_CACHE));
  return data;
};

/**
 * `bootstrap` como login: tentativa única, sem renovação nem retry (o token acabou de chegar
 * do GIS; se falhar, o usuário tenta de novo — desempenho.md §9.5).
 * @returns {Promise<*>} `data` do bootstrap.
 */
export const entrarComBootstrap = () => {
  const token = tokenUtilizavel(0);
  if (!token) return Promise.reject(erroLocal('NAO_AUTENTICADO', 401));
  return postar('bootstrap', {}, token, CONFIG.TIMEOUT_LOGIN_MS);
};

/**
 * `bootstrap` de atualização (sessão já aberta): single-flight, retry e renovação de token.
 * @returns {Promise<*>} `data` do bootstrap.
 */
export const atualizarBootstrap = () => lerDaRede('bootstrap', {});

/**
 * @typedef {Object} RespostaCheckUpdate
 * @property {boolean} changed
 * @property {number} ultima_escrita
 */

/**
 * Sinal global de mudança (GET público, custa ~3 ms no backend quando nada mudou).
 * @param {number} desde `ultima_escrita` conhecida pelo cliente.
 * @returns {Promise<RespostaCheckUpdate>} Resposta validada.
 */
export const verificarAtualizacao = async (desde) => {
  const since = Number.isFinite(desde) ? String(Math.trunc(desde)) : '0';
  const url = `${CONFIG.API_URL}?action=check_update&since=${encodeURIComponent(since)}`;
  const data = await buscarEnvelope('check_update', url, { method: 'GET' }, CONFIG.TIMEOUT_CHECK_MS);
  if (!ehObjeto(data) || typeof data.changed !== 'boolean' || !Number.isFinite(data.ultima_escrita)) {
    throw erroLocal('RESPOSTA_INVALIDA', 502);
  }
  return { changed: data.changed, ultima_escrita: data.ultima_escrita };
};

/**
 * Ping de aquecimento (fire-and-forget) na mesma rota `doPost` do login: tira o cold-start do
 * caminho crítico enquanto o usuário interage com o Google (desempenho.md §9.6). Não lê
 * planilha nem enfileira trabalho pesado.
 * @returns {void}
 */
export const aquecerBackend = () => {
  try {
    fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'ping' }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {
      // Best-effort: falha do aquecimento não afeta o login.
    });
  } catch (erro) {
    logAviso('ping_nao_enviado', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
  }
};
