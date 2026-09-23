/**
 * @file ui/icones.js
 * Ícones SVG (traço 2px, 24×24) criados com createElementNS — sem innerHTML.
 * Novos ícones: acrescente os elementos em ICONES.
 */

const NS_SVG = 'http://www.w3.org/2000/svg';

/** @typedef {[string, Object<string, string>]} ElementoIcone */

/** @type {Readonly<Object<string, ReadonlyArray<ElementoIcone>>>} */
const ICONES = Object.freeze({
  fechar: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  sucesso: [['path', { d: 'M20 6 9 17l-5-5' }]],
  erro: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M15 9l-6 6' }], ['path', { d: 'm9 9 6 6' }]],
  alerta: [
    ['path', { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  info: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
});

/**
 * @param {string} nome Nome do ícone (cai em `info` se não existir).
 * @param {string} [classe] Classe CSS.
 * @returns {SVGSVGElement} Ícone decorativo (aria-hidden).
 */
export const criarIcone = (nome, classe = '') => {
  const svg = document.createElementNS(NS_SVG, 'svg');
  [
    ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'],
    ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true'], ['focusable', 'false'],
  ].forEach(([a, v]) => svg.setAttribute(a, v));
  if (classe) svg.setAttribute('class', classe);
  (ICONES[nome] || ICONES.info).forEach(([tag, atributos]) => {
    const filho = document.createElementNS(NS_SVG, tag);
    Object.entries(atributos).forEach(([a, v]) => filho.setAttribute(a, v));
    svg.append(filho);
  });
  return svg;
};

/**
 * @param {string} nome Nome.
 * @returns {boolean} true se o ícone existe.
 */
export const iconeExiste = (nome) => Object.prototype.hasOwnProperty.call(ICONES, nome);
