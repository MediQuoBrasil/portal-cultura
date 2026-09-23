/**
 * @file sincronia.js
 * "IndexedDB-first, Apps Script só para escrita" (prompt.md §5.5):
 * - semeia o cache com o `bootstrap` (cada campo vira a chave da ação equivalente, no mesmo
 *   formato `{ok:true, data}` que a rede gravaria — desempenho.md §4);
 * - reabre a sessão a partir do cache local, sem rede;
 * - vigia o sinal global `check_update`: sem mudança → tudo fresco (nenhuma leitura de
 *   planilha); com mudança → novo bootstrap e evento `dados:atualizados`.
 *
 * O cache local pertence a UMA conta (hash do e-mail): outra conta no mesmo navegador
 * encontra o cache vazio.
 */

import { CONFIG, MAPA_BOOTSTRAP, POLITICA_CACHE } from './config.js';
import { ErroApi, atualizarBootstrap, verificarAtualizacao } from './api.js';
import {
  chaveDe, definirTodosFrescos, gravarMeta, gravarVarios, lerCache, lerMeta, limparCache,
} from './cache.js';
import { emitir } from './eventos.js';
import { logAviso, logInfo } from './log.js';
import { lerSessao } from './sessao.js';
import { ehObjeto } from './util.js';

/**
 * @typedef {Object} Permissoes
 * @property {boolean} responder_feedback
 * @property {boolean} ver_resultados_feedback
 * @property {boolean} administrar
 * @property {boolean} ver_votos_nominais
 * @property {boolean} analise_consultas
 * @property {boolean} enviar_casos
 */

/**
 * @typedef {Object} Perfil Resposta da rota `me`.
 * @property {string} email
 * @property {string} nome
 * @property {'profissional'|'admin'|'ceo'} papel
 * @property {string} especialidade
 * @property {Permissoes} permissoes
 */

/**
 * @typedef {Object} Snapshot Estado de dados da interface (espelho do bootstrap).
 * @property {Perfil} me
 * @property {?Object} paginas Resposta de `paginas` (null se o módulo falhou).
 * @property {?Object} enquetes Resposta de `enquetes_listar`.
 * @property {?Object} mural Resposta de `mural`.
 * @property {?Object} feedback Resposta de `feedback_perguntas`.
 * @property {number} ultima_escrita
 * @property {Array<string>} falhas Módulos que falharam no servidor.
 */

/** Campo do snapshot ← ação equivalente. */
const CAMPOS_SNAPSHOT = Object.freeze({
  me: 'me',
  paginas: 'paginas',
  enquetes: 'enquetes_listar',
  mural: 'mural',
  feedback: 'feedback_perguntas',
});

const META_DONO = 'dono';
const META_ULTIMA_ESCRITA = 'ultima_escrita';

/** @type {?ReturnType<typeof setInterval>} */
let intervaloVigia = null;
let ultimaVerificacao = 0;
let verificando = false;

/**
 * @param {*} perfil Valor.
 * @returns {boolean} true se tem o shape mínimo de Perfil.
 */
const ehPerfil = (perfil) => ehObjeto(perfil)
  && typeof perfil.nome === 'string'
  && typeof perfil.papel === 'string'
  && ehObjeto(perfil.permissoes);

/**
 * Garante que o cache local é da conta atual; se não for, apaga antes de usar.
 * @param {string} donoHash Hash do e-mail da sessão.
 * @returns {Promise<void>}
 */
export const garantirDonoDoCache = async (donoHash) => {
  const atual = await lerMeta(META_DONO);
  if (atual === donoHash) return;
  if (atual) logInfo('cache_de_outra_conta_descartado');
  await limparCache();
  await gravarMeta(META_DONO, donoHash);
};

/**
 * Valida o bootstrap e monta o snapshot.
 * @param {*} data `data` do bootstrap.
 * @returns {Snapshot} Snapshot.
 * @throws {ErroApi} RESPOSTA_INVALIDA se faltar o perfil.
 */
const snapshotDoBootstrap = (data) => {
  if (!ehObjeto(data) || !ehPerfil(data.me)) {
    throw new ErroApi({
      codigo: 'RESPOSTA_INVALIDA', status: 502, mensagem: 'O servidor respondeu de forma inesperada. Tente de novo.',
    });
  }
  const valor = (campo) => (ehObjeto(data[campo]) ? data[campo] : null);
  return {
    me: data.me,
    paginas: valor('conteudo'),
    enquetes: valor('enquetes'),
    mural: valor('mural'),
    feedback: valor('feedback'),
    ultima_escrita: Number.isFinite(data.ultima_escrita) ? data.ultima_escrita : 0,
    falhas: Array.isArray(data.falhas) ? data.falhas.filter((f) => typeof f === 'string') : [],
  };
};

/**
 * Grava cada campo do bootstrap na chave da ação equivalente e o `ultima_escrita`.
 * Campo que falhou no servidor (null) não sobrescreve o que já estava no cache.
 * @param {*} data `data` do bootstrap.
 * @returns {Promise<Snapshot>} Snapshot pronto para renderizar.
 */
export const semearBootstrap = async (data) => {
  const snapshot = snapshotDoBootstrap(data);
  const entradas = Object.entries(MAPA_BOOTSTRAP)
    .filter(([campo]) => ehObjeto(data[campo]))
    .map(([campo, acao]) => ({
      chave: chaveDe(acao, {}),
      valor: { ok: true, data: data[campo] },
      ttl: POLITICA_CACHE[acao],
    }));
  await gravarVarios(entradas);
  await gravarMeta(META_ULTIMA_ESCRITA, snapshot.ultima_escrita);
  return snapshot;
};

/**
 * Reabre a interface só com o cache local (sem rede). Exige o mesmo dono e o perfil.
 * @param {string} donoHash Hash do e-mail da sessão.
 * @returns {Promise<?Snapshot>} Snapshot ou null.
 */
export const lerSnapshotLocal = async (donoHash) => {
  if ((await lerMeta(META_DONO)) !== donoHash) return null;
  const campos = Object.entries(CAMPOS_SNAPSHOT);
  const leituras = await Promise.all(campos.map(([, acao]) => lerCache(chaveDe(acao, {}))));
  const dados = Object.fromEntries(campos.map(([campo], i) => {
    const leitura = leituras[i];
    const valido = leitura && ehObjeto(leitura.valor) && leitura.valor.ok === true;
    const envelope = valido ? leitura.valor : null;
    return [campo, envelope && ehObjeto(envelope.data) ? envelope.data : null];
  }));
  if (!ehPerfil(dados.me)) return null;
  const ultima = await lerMeta(META_ULTIMA_ESCRITA);
  return {
    ...dados, ultima_escrita: Number.isFinite(ultima) ? ultima : 0, falhas: [],
  };
};

/**
 * Consulta o sinal global e, se houve escrita, refaz o bootstrap.
 * @param {{forcar?: boolean}} [opcoes] `forcar` ignora o intervalo mínimo.
 * @returns {Promise<void>} Nunca rejeita (falhas são logadas; a tela segue com o cache).
 */
export const verificarAgora = async ({ forcar = false } = {}) => {
  if (verificando || !lerSessao()) return;
  if (!forcar && Date.now() - ultimaVerificacao < CONFIG.CHECK_MIN_INTERVALO_MS) return;
  verificando = true;
  ultimaVerificacao = Date.now();
  try {
    const desde = await lerMeta(META_ULTIMA_ESCRITA);
    const sinal = await verificarAtualizacao(Number.isFinite(desde) ? desde : 0);
    if (!sinal.changed) {
      definirTodosFrescos(true);
      return;
    }
    definirTodosFrescos(false);
    logInfo('dados_mudaram_no_servidor');
    const snapshot = await semearBootstrap(await atualizarBootstrap());
    definirTodosFrescos(true);
    emitir('dados:atualizados', snapshot);
  } catch (erro) {
    if (erro instanceof ErroApi && erro.codigo === 'PROIBIDO') {
      emitir('acesso:negado');
      return;
    }
    logAviso('verificacao_atualizacao_falhou', { codigo: erro instanceof ErroApi ? erro.codigo : 'desconhecido' });
  } finally {
    verificando = false;
  }
};

/** @returns {void} */
const aoMudarVisibilidade = () => {
  if (document.visibilityState === 'visible') verificarAgora();
};

/** @returns {void} */
const aoVoltarConexao = () => verificarAgora({ forcar: true });

/**
 * Liga a vigia: a cada INTERVALO_CHECK_MS com a aba visível, ao voltar o foco e ao voltar a
 * conexão (respeitando o intervalo mínimo).
 * @returns {void}
 */
export const iniciarVigia = () => {
  if (intervaloVigia) return;
  intervaloVigia = setInterval(() => {
    if (document.visibilityState === 'visible') verificarAgora();
  }, CONFIG.INTERVALO_CHECK_MS);
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  globalThis.addEventListener('online', aoVoltarConexao);
};

/** @returns {void} */
export const pararVigia = () => {
  clearInterval(intervaloVigia);
  intervaloVigia = null;
  document.removeEventListener('visibilitychange', aoMudarVisibilidade);
  globalThis.removeEventListener('online', aoVoltarConexao);
};
