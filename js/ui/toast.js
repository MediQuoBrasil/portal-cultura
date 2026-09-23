/**
 * @file ui/toast.js
 * Mensagens rápidas (padrão ui.js), com papel ARIA por tipo: `alert` para erro,
 * `status` para o resto. No máximo 3 visíveis.
 */

import { criarElemento } from './dom.js';
import { criarIcone } from './icones.js';

/** @typedef {'info'|'sucesso'|'erro'|'alerta'} TipoToast */

const MAXIMO_VISIVEIS = 3;
const DURACAO_SAIDA_MS = 350;

/**
 * @param {HTMLElement} toast Toast.
 * @returns {void}
 */
const removerToast = (toast) => {
  toast.classList.remove('toast--visivel');
  setTimeout(() => toast.remove(), DURACAO_SAIDA_MS);
};

/**
 * @param {string} mensagem Texto (seguro: via textContent).
 * @param {{tipo?: TipoToast, duracaoMs?: number}} [opcoes] Opções.
 * @returns {void}
 */
const mostrarToast = (mensagem, { tipo = 'info', duracaoMs = 4500 } = {}) => {
  const regiao = document.getElementById('regiaoToast');
  if (!regiao || typeof mensagem !== 'string' || !mensagem) return;
  const existentes = regiao.querySelectorAll('.toast');
  if (existentes.length >= MAXIMO_VISIVEIS) existentes[0].remove();

  const toast = criarElemento('div', {
    classe: ['toast', `toast--${tipo}`],
    atributos: { role: tipo === 'erro' ? 'alert' : 'status' },
    filhos: [criarIcone(tipo, 'toast__icone'), criarElemento('p', { texto: mensagem })],
  });
  regiao.append(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visivel'));
  setTimeout(() => removerToast(toast), duracaoMs);
};

export default mostrarToast;
