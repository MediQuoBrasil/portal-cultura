/**
 * @file ui/tema.js
 * Tema claro/escuro (padrão ui.js): escuro por padrão, escolha persistida em localStorage.
 * O tema inicial é aplicado antes da pintura por js/tema-inicial.js (mesma chave).
 */

import { logAviso } from '../log.js';

/** @typedef {'dark'|'light'} Tema */

const CHAVE_TEMA = 'pc:tema';
const COR_BARRA = Object.freeze({ dark: '#050506', light: '#f7f7f8' });

/** @type {Array<function(Tema): void>} */
const ouvintes = [];

/** @returns {Tema} Tema aplicado no documento. */
export const temaAtual = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

/**
 * Atualiza rótulos acessíveis dos botões de tema (descrevem a AÇÃO).
 * @param {Tema} tema Tema atual.
 * @returns {void}
 */
const sincronizarBotoes = (tema) => {
  const rotulo = tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
  document.querySelectorAll('[data-acao="alternar-tema"]').forEach((botao) => {
    botao.setAttribute('aria-label', rotulo);
    botao.setAttribute('title', rotulo);
  });
};

/**
 * @param {Tema} tema Tema a aplicar.
 * @returns {void}
 */
export const aplicarTema = (tema) => {
  const valido = tema === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', valido);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COR_BARRA[valido]);
  sincronizarBotoes(valido);
  try {
    localStorage.setItem(CHAVE_TEMA, valido);
  } catch (erro) {
    logAviso('tema_nao_persistido', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
  }
  ouvintes.forEach((ouvinte) => ouvinte(valido));
};

/** @returns {void} */
export const alternarTema = () => aplicarTema(temaAtual() === 'dark' ? 'light' : 'dark');

/**
 * Liga os botões `[data-acao="alternar-tema"]` e registra um ouvinte opcional.
 * @param {{aoMudar?: function(Tema): void}} [opcoes] Opções.
 * @returns {void}
 */
export const iniciarTema = ({ aoMudar } = {}) => {
  if (typeof aoMudar === 'function') ouvintes.push(aoMudar);
  document.querySelectorAll('[data-acao="alternar-tema"]').forEach((botao) => {
    botao.addEventListener('click', alternarTema);
  });
  sincronizarBotoes(temaAtual());
};
