/**
 * @file modulos/modulos.js
 * Registro dos módulos funcionais (páginas `tipo = modulo`): módulo novo = uma entrada em
 * `CARREGADORES` + a pasta dele.
 *
 * A tela de cada módulo é carregada sob demanda (`import()` dinâmico): quem nunca abre as
 * enquetes não baixa o código delas.
 */

import { limparAbas } from './abas.js';
import { rascunhos } from './feedback/dados.js';

/** @typedef {import('../sincronia.js').Snapshot} Snapshot */

/**
 * @typedef {Object} ContextoModulo
 * @property {Snapshot} snapshot Dados da sessão (perfil e permissões).
 * @property {function(): boolean} vigente false quando outra rota já foi pintada: o módulo
 *   descarta respostas que chegarem depois.
 */

/**
 * @typedef {function(HTMLElement, ContextoModulo): Promise<void>} MontarModulo
 */

/**
 * Módulos que já têm tela → carregador sob demanda. Módulo fora daqui continua com o estado
 * "abre em breve" em paginas.js.
 * @type {Readonly<Object<string, function(): Promise<{default: MontarModulo}>>>}
 */
const CARREGADORES = Object.freeze({
  feedback: () => import('./feedback/feedback.js'),
});

/**
 * @param {string} modulo Nome do módulo (Config.gs → MODULOS).
 * @returns {boolean} true se o módulo já tem tela.
 */
export const moduloDisponivel = (modulo) => Object.prototype.hasOwnProperty.call(CARREGADORES, modulo);

/**
 * Monta o módulo na área. Erros de carregamento sobem para quem chamou (paginas.js mostra o
 * estado de erro da seção).
 * @param {string} modulo Nome do módulo.
 * @param {HTMLElement} area Contêiner.
 * @param {ContextoModulo} ctx Contexto.
 * @returns {Promise<void>}
 */
export const montarModulo = async (modulo, area, ctx) => {
  if (!moduloDisponivel(modulo)) return;
  const { default: montar } = await CARREGADORES[modulo]();
  if (!ctx.vigente()) return;
  await montar(area, ctx);
};

/**
 * Esquece o estado em memória dos módulos (fim de sessão): abas lembradas e rascunhos do
 * feedback (conteúdo anônimo não pode sobreviver a uma troca de conta no mesmo navegador).
 * @returns {void}
 */
export const limparModulos = () => {
  limparAbas();
  rascunhos.clear();
};
