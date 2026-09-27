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

  // Blocos
  documento: [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['path', { d: 'M14 2v6h6' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }],
  ],
  play: [['path', { d: 'M7 4.5v15l12-7.5z' }]],
  externo: [
    ['path', { d: 'M15 3h6v6' }], ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
  ],
  imagem: [
    ['rect', {
      x: '3', y: '3', width: '18', height: '18', rx: '2',
    }],
    ['circle', { cx: '9', cy: '9', r: '2' }], ['path', { d: 'm21 15-5-5L5 21' }],
  ],

  // Editor
  lapis: [['path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }]],
  lixeira: [
    ['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
  ],
  'seta-cima': [['path', { d: 'm18 15-6-6-6 6' }]],
  'seta-baixo': [['path', { d: 'm6 9 6 6 6-6' }]],
  voltar: [['path', { d: 'm15 18-6-6 6-6' }]],
  mais: [['path', { d: 'M12 5v14' }], ['path', { d: 'M5 12h14' }]],
  olho: [['path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  'olho-fechado': [
    ['path', { d: 'M9.88 9.88a3 3 0 1 0 4.24 4.24' }],
    ['path', { d: 'M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68' }],
    ['path', { d: 'M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  ajustes: [
    ['path', { d: 'M4 21v-7' }], ['path', { d: 'M4 10V3' }], ['path', { d: 'M12 21v-9' }], ['path', { d: 'M12 8V3' }],
    ['path', { d: 'M20 21v-5' }], ['path', { d: 'M20 12V3' }], ['path', { d: 'M1 14h6' }], ['path', { d: 'M9 8h6' }],
    ['path', { d: 'M17 16h6' }],
  ],
  texto: [['path', { d: 'M17 10H3' }], ['path', { d: 'M21 6H3' }], ['path', { d: 'M21 14H3' }], ['path', { d: 'M17 18H3' }]],
  cartao: [
    ['rect', {
      x: '3', y: '3', width: '18', height: '18', rx: '2',
    }],
    ['path', { d: 'M3 9h18' }],
  ],
  usuario: [['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }], ['circle', { cx: '12', cy: '7', r: '4' }]],
  'linha-tempo': [['circle', { cx: '12', cy: '12', r: '3' }], ['path', { d: 'M12 3v6' }], ['path', { d: 'M12 15v6' }]],

  // Aceitos na coluna `icone` da aba `paginas`
  casa: [['path', { d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }], ['path', { d: 'M9 22V12h6v10' }]],
  livro: [
    ['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }],
    ['path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }],
  ],
  pessoas: [
    ['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }], ['circle', { cx: '9', cy: '7', r: '4' }],
    ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  ],
  estrela: [['path', { d: 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z' }]],
  coracao: [['path', { d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z' }]],
  calendario: [
    ['rect', {
      x: '3', y: '4', width: '18', height: '18', rx: '2',
    }],
    ['path', { d: 'M16 2v4' }], ['path', { d: 'M8 2v4' }], ['path', { d: 'M3 10h18' }],
  ],
  mensagem: [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }]],
  escudo: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]],
  grafico: [['path', { d: 'M18 20V10' }], ['path', { d: 'M12 20V4' }], ['path', { d: 'M6 20v-6' }]],
  video: [
    ['rect', {
      x: '2', y: '5', width: '15', height: '14', rx: '2',
    }],
    ['path', { d: 'm17 10 5-3v10l-5-3' }],
  ],
});

/**
 * Ícones que uma página (item do menu) pode usar — os mesmos listados no LEIAME para a
 * coluna `icone` da aba `paginas`.
 * @type {ReadonlyArray<string>}
 */
export const ICONES_PAGINA = Object.freeze([
  'casa', 'livro', 'pessoas', 'estrela', 'coracao', 'calendario', 'mensagem', 'escudo', 'grafico', 'video', 'documento',
]);

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
