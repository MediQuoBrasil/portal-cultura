/**
 * @file ui/carregando.js
 * Estado de carregamento em botões (padrão ui.js), acessível: `aria-busy`, `disabled` e
 * rótulo trocado sem perder o original.
 */

import { criarElemento } from './dom.js';

/**
 * @param {HTMLButtonElement} botao Botão com um `.botao__rotulo` (opcional).
 * @param {boolean} ativo Liga/desliga.
 * @param {string} [textoCarregando='Aguarde…'] Rótulo durante a espera.
 * @returns {void}
 */
const definirCarregando = (botao, ativo, textoCarregando = 'Aguarde…') => {
  if (!(botao instanceof HTMLButtonElement)) return;
  const rotulo = botao.querySelector('.botao__rotulo');
  const spinnerAtual = botao.querySelector('.spinner[data-carregando]');
  if (ativo) {
    if (spinnerAtual) return;
    if (rotulo) {
      botao.setAttribute('data-rotulo-original', rotulo.textContent || '');
      rotulo.replaceChildren(textoCarregando);
    }
    botao.prepend(criarElemento('span', { classe: 'spinner', atributos: { 'data-carregando': true, 'aria-hidden': 'true' } }));
    botao.setAttribute('aria-busy', 'true');
    botao.toggleAttribute('disabled', true);
    return;
  }
  if (spinnerAtual) spinnerAtual.remove();
  if (rotulo && botao.hasAttribute('data-rotulo-original')) {
    rotulo.replaceChildren(botao.getAttribute('data-rotulo-original'));
    botao.removeAttribute('data-rotulo-original');
  }
  botao.removeAttribute('aria-busy');
  botao.toggleAttribute('disabled', false);
};

export default definirCarregando;
