/**
 * @file modulos/feedback/dados.js
 * Acesso do módulo de feedback ao backend e normalização das respostas (sem DOM).
 *
 * Cache (config.js → POLITICA_CACHE):
 * - `feedback_perguntas` é nível 1: cache SWR (5 min), semeado pelo bootstrap e invalidado
 *   por `feedback_enviar` (MAPA_INVALIDACAO). Por isso o módulo lê a rota, e não o snapshot:
 *   depois de enviar, a próxima abertura já vem da rede com `ja_respondeu = true`.
 * - `feedback_resultados` NÃO está na allowlist: vai sempre à rede e nunca é persistido
 *   (dado agregado sensível vive só em memória).
 *
 * Anonimato: as respostas NUNCA vão para cache, IndexedDB ou log. O rascunho em andamento
 * fica só em memória (ver `rascunhos`) e some ao sair da sessão ou recarregar.
 */

import { escrever, ler } from '../../api.js';
import { ehObjeto } from '../../util.js';

/** @typedef {'escala_1_5'|'nps_0_10'|'multipla'|'texto'} TipoPergunta */

/**
 * @typedef {Object} Pergunta
 * @property {string} id
 * @property {string} texto
 * @property {TipoPergunta} tipo
 * @property {Array<string>} opcoes Só em `multipla`.
 * @property {boolean} obrigatoria
 */

/**
 * @typedef {Object} StatusFeedback
 * @property {boolean} habilitado Pode responder agora.
 * @property {string} ciclo Ciclo vigente.
 * @property {boolean} jaRespondeu
 * @property {Array<Pergunta>} perguntas Perguntas ativas do ciclo.
 * @property {boolean} podeVerResultados
 * @property {number} kMinimo
 * @property {number} textoMax
 */

/**
 * @typedef {Object} ResultadoPergunta
 * @property {string} id
 * @property {string} texto
 * @property {TipoPergunta} tipo
 * @property {boolean} suficiente
 * @property {?number} n
 * @property {Array<{rotulo: string, total: number}>} distribuicao Na ordem de exibição.
 * @property {?number} media Escala 1–5.
 * @property {?{promotores: number, neutros: number, detratores: number, nps: number}} nps
 * @property {Array<string>} textos Texto livre (já embaralhado pelo servidor).
 */

/**
 * @typedef {Object} ResultadosFeedback
 * @property {string} ciclo
 * @property {number} kMinimo
 * @property {boolean} suficiente
 * @property {?number} respostas Submissões no ciclo (null quando insuficiente).
 * @property {Array<ResultadoPergunta>} perguntas
 * @property {Array<string>} ciclosDisponiveis Mais recente primeiro.
 */

const TIPOS = Object.freeze(['escala_1_5', 'nps_0_10', 'multipla', 'texto']);
const REGEX_CICLO = /^[A-Za-z0-9_-]{1,32}$/;
const TEXTO_MAX_PADRAO = 1000;

const texto = (v) => (typeof v === 'string' ? v : '');
const inteiro = (v, padrao) => (Number.isInteger(v) ? v : padrao);
const numeroOuNulo = (v) => (Number.isFinite(v) ? v : null);

/**
 * @param {*} bruto Pergunta vinda do servidor.
 * @returns {?Pergunta} Pergunta válida ou null.
 */
const normalizarPergunta = (bruto) => {
  if (!ehObjeto(bruto) || !texto(bruto.id) || !texto(bruto.texto) || !TIPOS.includes(bruto.tipo)) return null;
  const opcoes = Array.isArray(bruto.opcoes) ? bruto.opcoes.filter((o) => typeof o === 'string' && o !== '') : [];
  if (bruto.tipo === 'multipla' && opcoes.length < 2) return null;
  return {
    id: bruto.id,
    texto: bruto.texto,
    tipo: bruto.tipo,
    opcoes: bruto.tipo === 'multipla' ? opcoes : [],
    obrigatoria: bruto.obrigatoria === true,
  };
};

/**
 * Valida o status (função pura).
 * @param {*} data `data` da rota `feedback_perguntas`.
 * @returns {StatusFeedback} Status normalizado.
 * @throws {TypeError} Sem o shape mínimo.
 */
export const normalizarStatus = (data) => {
  if (!ehObjeto(data) || !REGEX_CICLO.test(texto(data.ciclo))) throw new TypeError('status de feedback inválido');
  const perguntas = Array.isArray(data.perguntas) ? data.perguntas.map(normalizarPergunta).filter(Boolean) : [];
  return {
    habilitado: data.habilitado === true && perguntas.length > 0,
    ciclo: data.ciclo,
    jaRespondeu: data.ja_respondeu === true,
    perguntas,
    podeVerResultados: data.pode_ver_resultados === true,
    kMinimo: inteiro(data.k_minimo, 5),
    textoMax: inteiro(data.texto_max, TEXTO_MAX_PADRAO),
  };
};

/**
 * Faixa fixa de rótulos para escalas: garante todas as barras, mesmo com zero respostas.
 * @param {TipoPergunta} tipo Tipo.
 * @param {Array<string>} opcoes Opções (múltipla).
 * @param {Object<string, *>} bruta Distribuição vinda do servidor.
 * @returns {Array<{rotulo: string, total: number}>} Distribuição ordenada.
 */
const ordenarDistribuicao = (tipo, opcoes, bruta) => {
  let rotulos = Object.keys(bruta);
  if (tipo === 'escala_1_5') rotulos = ['1', '2', '3', '4', '5'];
  else if (tipo === 'nps_0_10') rotulos = Array.from({ length: 11 }, (_, i) => String(i));
  else if (opcoes.length > 0) rotulos = opcoes.concat(rotulos.filter((r) => !opcoes.includes(r)));
  return rotulos.map((rotulo) => ({ rotulo, total: Math.max(0, inteiro(bruta[rotulo], 0)) }));
};

/**
 * @param {*} bruto Resultado de uma pergunta.
 * @returns {?ResultadoPergunta} Resultado válido ou null.
 */
const normalizarResultadoPergunta = (bruto) => {
  if (!ehObjeto(bruto) || !texto(bruto.id) || !texto(bruto.texto) || !TIPOS.includes(bruto.tipo)) return null;
  const suficiente = bruto.suficiente === true;
  const nps = ehObjeto(bruto.nps) ? {
    promotores: inteiro(bruto.nps.promotores, 0),
    neutros: inteiro(bruto.nps.neutros, 0),
    detratores: inteiro(bruto.nps.detratores, 0),
    nps: inteiro(bruto.nps.nps, 0),
  } : null;
  return {
    id: bruto.id,
    texto: bruto.texto,
    tipo: bruto.tipo,
    suficiente,
    n: suficiente ? numeroOuNulo(bruto.n) : null,
    distribuicao: suficiente && ehObjeto(bruto.distribuicao)
      ? ordenarDistribuicao(bruto.tipo, Array.isArray(bruto.opcoes) ? bruto.opcoes : [], bruto.distribuicao)
      : [],
    media: suficiente ? numeroOuNulo(bruto.media) : null,
    nps: suficiente ? nps : null,
    textos: suficiente && Array.isArray(bruto.textos) ? bruto.textos.filter((t) => typeof t === 'string' && t) : [],
  };
};

/**
 * Valida os resultados (função pura).
 * @param {*} data `data` da rota `feedback_resultados`.
 * @returns {ResultadosFeedback} Resultados normalizados.
 * @throws {TypeError} Sem o shape mínimo.
 */
export const normalizarResultados = (data) => {
  if (!ehObjeto(data) || !REGEX_CICLO.test(texto(data.ciclo))) throw new TypeError('resultados de feedback inválidos');
  const suficiente = data.suficiente === true;
  return {
    ciclo: data.ciclo,
    kMinimo: inteiro(data.k_minimo, 5),
    suficiente,
    respostas: suficiente ? numeroOuNulo(data.respostas) : null,
    perguntas: suficiente && Array.isArray(data.perguntas)
      ? data.perguntas.map(normalizarResultadoPergunta).filter(Boolean)
      : [],
    ciclosDisponiveis: Array.isArray(data.ciclos_disponiveis)
      ? data.ciclos_disponiveis.filter((c) => typeof c === 'string' && REGEX_CICLO.test(c))
      : [],
  };
};

/**
 * @param {{forcarRede?: boolean}} [opcoes] `forcarRede` ignora o cache local.
 * @returns {Promise<StatusFeedback>} Status do ciclo para o usuário.
 */
export const carregarStatus = async (opcoes = {}) => normalizarStatus(await ler('feedback_perguntas', {}, opcoes));

/**
 * @param {string} [ciclo] Ciclo ('' = vigente).
 * @returns {Promise<ResultadosFeedback>} Resultados agregados.
 */
export const carregarResultados = async (ciclo = '') => normalizarResultados(
  await ler('feedback_resultados', ciclo ? { ciclo } : {}, { forcarRede: true }),
);

/**
 * Envia as respostas (rota anônima no servidor). Nunca é repetida automaticamente em
 * falha de rede: o resultado seria desconhecido (api.js → escrever).
 * @param {string} ciclo Ciclo exibido ao usuário.
 * @param {Object<string, string|number>} respostas pergunta_id → valor.
 * @returns {Promise<void>}
 */
export const enviarRespostas = async (ciclo, respostas) => {
  await escrever('feedback_enviar', { ciclo, respostas });
};

/**
 * Rascunhos em memória, por ciclo (nunca persistidos: é conteúdo anônimo).
 * @type {Map<string, Object<string, string>>}
 */
export const rascunhos = new Map();

/**
 * Rótulo legível do ciclo: `2026-09` → `setembro de 2026`; outros ids ficam como estão.
 * @param {string} ciclo Ciclo.
 * @returns {string} Rótulo.
 */
export const rotuloCiclo = (ciclo) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ciclo);
  if (!m) return ciclo;
  const data = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15));
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(data);
};
