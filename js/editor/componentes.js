/**
 * @file editor/componentes.js
 * Peças visuais pequenas e repetidas no editor (botão de ícone com rótulo acessível, selo e
 * cartão de estado), sobre as classes do design system.
 */

import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';

/**
 * @typedef {Object} OpcoesBotaoAcao
 * @property {string} icone Ícone.
 * @property {string} rotulo Nome acessível (e dica ao passar o mouse).
 * @property {function(): void} aoClicar Tratador.
 * @property {string} [foco] Chave para devolver o foco após redesenhar (`data-foco`).
 * @property {boolean} [desativado=false]
 * @property {boolean} [perigo=false] Ação destrutiva (cor de perigo no hover).
 * @property {boolean} [pressionado] Estado de alternância (`aria-pressed`).
 */

/**
 * Botão só com ícone. O rótulo vai em `aria-label` e `title`.
 * @param {OpcoesBotaoAcao} opcoes Opções.
 * @returns {HTMLButtonElement} Botão.
 */
export const criarBotaoAcao = ({
  icone, rotulo, aoClicar, foco, desativado = false, perigo = false, pressionado,
}) => criarElemento('button', {
  classe: ['botao', 'botao--fantasma', 'botao--icone', 'botao--sm', perigo ? 'botao--acao-perigo' : ''],
  atributos: {
    type: 'button',
    'aria-label': rotulo,
    title: rotulo,
    'data-foco': foco,
    disabled: desativado,
    'aria-pressed': pressionado === undefined ? undefined : String(pressionado),
  },
  filhos: [criarIcone(icone, 'botao__icone')],
  eventos: { click: () => { if (!desativado) aoClicar(); } },
});

/**
 * @param {string} texto Texto.
 * @param {'acento'|'neutro'|'alerta'|'perigo'|'sucesso'} [variante='neutro'] Cor.
 * @returns {HTMLElement} Selo.
 */
export const criarSelo = (texto, variante = 'neutro') => criarElemento('span', {
  classe: ['selo', variante === 'acento' ? '' : `selo--${variante}`],
  texto,
});

/**
 * Cartão de estado (carregando, erro, vazio).
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.titulo Frase curta.
 * @param {string} [opcoes.texto] Orientação.
 * @param {string} [opcoes.icone='info'] Ícone.
 * @param {boolean} [opcoes.carregando=false] Mostra spinner no lugar do ícone.
 * @param {?HTMLElement} [opcoes.acao] Botão de ação.
 * @returns {HTMLElement} Cartão.
 */
export const criarEstadoEditor = ({
  titulo, texto, icone = 'info', carregando = false, acao = null,
}) => criarElemento('div', {
  classe: 'cartao estado',
  atributos: { role: carregando ? 'status' : undefined },
  filhos: [
    carregando
      ? criarElemento('span', { classe: 'spinner', atributos: { 'aria-hidden': 'true' } })
      : criarElemento('span', { classe: 'icone-caixa', filhos: [criarIcone(icone)] }),
    criarElemento('div', {
      classe: 'estado__textos',
      filhos: [
        criarElemento('p', { classe: 'estado__titulo', texto: titulo }),
        texto ? criarElemento('p', { classe: 'texto-mudo', texto }) : null,
        acao,
      ],
    }),
  ],
});
