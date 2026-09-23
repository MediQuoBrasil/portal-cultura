/**
 * @file previa/ui.js
 * Utilitários do protótipo: DOM seguro (createElement + textContent, nunca innerHTML),
 * ícones SVG, toast e datas. Autocontido de propósito: o protótipo não depende dos
 * módulos de produção em js/, então pode ser apagado sem efeito colateral.
 */

const NS_SVG = 'http://www.w3.org/2000/svg';

/**
 * @typedef {Object} OpcoesElemento
 * @property {string|Array<string>} [classe] Classe(s) CSS.
 * @property {string} [texto] Conteúdo textual.
 * @property {Object<string, (string|boolean|null|undefined)>} [atributos] Atributos (sem `on*`).
 * @property {Array<Node|string|null|undefined|false>} [filhos] Filhos.
 * @property {Object<string, EventListener>} [eventos] Ouvintes.
 */

/**
 * Cria um elemento HTML sem innerHTML. Atributos `on*` são recusados.
 * @param {string} tag Tag.
 * @param {OpcoesElemento} [opcoes] Opções.
 * @returns {HTMLElement} Elemento.
 * @throws {TypeError} Atributo de evento.
 */
export const criarElemento = (tag, opcoes = {}) => {
  const {
    classe, texto, atributos = {}, filhos = [], eventos = {},
  } = opcoes;
  const elemento = document.createElement(tag);
  if (classe) {
    const lista = Array.isArray(classe) ? classe : classe.split(/\s+/);
    elemento.classList.add(...lista.filter(Boolean));
  }
  Object.entries(atributos).forEach(([nome, valor]) => {
    if (valor === undefined || valor === null || valor === false) return;
    if (/^on/i.test(nome)) throw new TypeError(`atributo de evento não permitido: ${nome}`);
    elemento.setAttribute(nome, valor === true ? '' : String(valor));
  });
  if (typeof texto === 'string') elemento.textContent = texto;
  elemento.append(...filhos.filter((f) => f !== null && f !== undefined && f !== false));
  Object.entries(eventos).forEach(([nome, ouvinte]) => elemento.addEventListener(nome, ouvinte));
  return elemento;
};

/**
 * @param {string} id ID.
 * @returns {HTMLElement} Elemento.
 * @throws {Error} Se ausente (erro de marcação).
 */
export const exigirElemento = (id) => {
  const elemento = document.getElementById(id);
  if (!elemento) throw new Error(`elemento #${id} ausente no HTML`);
  return elemento;
};

/** @typedef {[string, Object<string, string>]} ElementoIcone */

/** @type {Readonly<Object<string, ReadonlyArray<ElementoIcone>>>} */
const ICONES = Object.freeze({
  casa: [['path', { d: 'M3 10.5 12 3l9 7.5' }], ['path', { d: 'M5 9.5V21h14V9.5' }], ['path', { d: 'M10 21v-6h4v6' }]],
  coracao: [['path', { d: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z' }]],
  alvo: [['circle', { cx: '12', cy: '12', r: '10' }], ['circle', { cx: '12', cy: '12', r: '6' }], ['circle', { cx: '12', cy: '12', r: '2' }]],
  pessoas: [
    ['circle', { cx: '9', cy: '7', r: '4' }], ['path', { d: 'M1 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2' }],
    ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }], ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }],
  ],
  usuario: [['circle', { cx: '12', cy: '8', r: '4' }], ['path', { d: 'M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1' }]],
  livro: [['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }], ['path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }]],
  play: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'm10 8 6 4-6 4z' }]],
  bolo: [
    ['path', { d: 'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8' }], ['path', { d: 'M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1' }],
    ['path', { d: 'M2 21h20' }], ['path', { d: 'M7 8v3M12 8v3M17 8v3' }], ['path', { d: 'M7 4h.01M12 4h.01M17 4h.01' }],
  ],
  brilho: [['path', { d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z' }], ['path', { d: 'M19 16v5M16.5 18.5h5' }]],
  prancheta: [
    ['rect', { x: '8', y: '2', width: '8', height: '4', rx: '1' }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }], ['path', { d: 'M9 12h6M9 16h6' }],
  ],
  escudo: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
  calendario: [['rect', { x: '3', y: '4', width: '18', height: '18', rx: '2' }], ['path', { d: 'M16 2v4M8 2v4M3 10h18' }]],
  enquete: [['path', { d: 'M3 3v18h18' }], ['path', { d: 'M8 17v-5M13 17V8M18 17v-8' }]],
  sorriso: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }], ['path', { d: 'M9 9h.01M15 9h.01' }]],
  camera: [['path', { d: 'm23 7-7 5 7 5V7z' }], ['rect', { x: '1', y: '5', width: '15', height: '14', rx: '2' }]],
  wifi: [['path', { d: 'M5 12.55a11 11 0 0 1 14 0' }], ['path', { d: 'M1.4 9a16 16 0 0 1 21.2 0' }], ['path', { d: 'M8.5 16.1a6 6 0 0 1 7 0' }], ['path', { d: 'M12 20h.01' }]],
  cadeado: [['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]],
  documento: [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 2v6h6' }], ['path', { d: 'M9 13h6M9 17h6' }],
  ],
  'chevron-esquerda': [['path', { d: 'm15 18-6-6 6-6' }]],
  'chevron-direita': [['path', { d: 'm9 18 6-6-6-6' }]],
  download: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'm7 10 5 5 5-5' }], ['path', { d: 'M12 15V3' }]],
  email: [['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }], ['path', { d: 'm22 6-10 7L2 6' }]],
  fechar: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  sucesso: [['path', { d: 'M20 6 9 17l-5-5' }]],
  erro: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M15 9l-6 6' }], ['path', { d: 'm9 9 6 6' }]],
  alerta: [
    ['path', { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }],
    ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }],
  ],
  info: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
});

/**
 * @param {string} nome Nome do ícone (cai em `info` se não existir).
 * @param {string} [classe] Classe CSS.
 * @returns {SVGSVGElement} Ícone decorativo.
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
 * Troca os marcadores `[data-icone]` do HTML estático pelos SVGs.
 * `.icone-caixa` recebe o SVG dentro; os demais são substituídos.
 * @param {ParentNode} [raiz=document] Raiz.
 * @returns {void}
 */
export const hidratarIcones = (raiz = document) => {
  raiz.querySelectorAll('[data-icone]').forEach((marcador) => {
    const nome = marcador.getAttribute('data-icone') || 'info';
    if (marcador.classList.contains('icone-caixa')) {
      marcador.removeAttribute('data-icone');
      marcador.append(criarIcone(nome));
      return;
    }
    const classe = marcador.closest('.botao') ? 'botao__icone' : 'prot-nav__icone';
    marcador.replaceWith(criarIcone(nome, classe));
  });
};

/** @typedef {'info'|'sucesso'|'erro'|'alerta'} TipoToast */

/**
 * Mostra um toast (máx. 3 visíveis). Papel ARIA `alert` só para erro.
 * @param {string} mensagem Texto.
 * @param {TipoToast} [tipo='info'] Tipo.
 * @returns {void}
 */
export const mostrarToast = (mensagem, tipo = 'info') => {
  const regiao = document.getElementById('regiaoToast');
  if (!regiao || typeof mensagem !== 'string' || !mensagem) return;
  const existentes = regiao.querySelectorAll('.toast');
  if (existentes.length >= 3) existentes[0].remove();
  const toast = criarElemento('div', {
    classe: ['toast', `toast--${tipo}`],
    atributos: { role: tipo === 'erro' ? 'alert' : 'status' },
    filhos: [criarIcone(tipo, 'toast__icone'), criarElemento('p', { texto: mensagem })],
  });
  regiao.append(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visivel'));
  setTimeout(() => {
    toast.classList.remove('toast--visivel');
    setTimeout(() => toast.remove(), 350);
  }, 4500);
};

/**
 * @param {string} nome Nome completo.
 * @returns {string} Até 2 iniciais em maiúsculas.
 */
export const iniciais = (nome) => {
  const partes = String(nome).trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return `${primeira}${ultima}`.toUpperCase();
};

/**
 * @param {string} nome Nome completo.
 * @returns {string} Primeiro nome.
 */
export const primeiroNome = (nome) => String(nome).trim().split(/\s+/)[0] || '';

/** @returns {Date} Hoje à meia-noite local. */
export const hoje = () => {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
};

/**
 * @param {Date} data Data base.
 * @param {number} dias Dias a somar (pode ser negativo).
 * @returns {Date} Nova data.
 */
export const somarDias = (data, dias) => new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);

/**
 * @param {Date} a Data A.
 * @param {Date} b Data B.
 * @returns {boolean} Mesmo dia civil.
 */
export const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

/**
 * @param {Date} data Data.
 * @param {Intl.DateTimeFormatOptions} opcoes Formato.
 * @returns {string} Data formatada em pt-BR.
 */
export const formatarData = (data, opcoes) => new Intl.DateTimeFormat('pt-BR', opcoes).format(data);

/**
 * @param {number} mes Mês (0–11).
 * @returns {string} Nome do mês com inicial maiúscula.
 */
export const nomeMes = (mes) => {
  const nome = formatarData(new Date(2000, mes, 1), { month: 'long' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};

/**
 * Avatar de iniciais tingido com a cor da área.
 * @param {string} nome Nome.
 * @param {string} cor Cor da área (hex).
 * @returns {HTMLElement} Avatar.
 */
export const criarAvatar = (nome, cor) => {
  const avatar = criarElemento('span', { classe: 'avatar', texto: iniciais(nome), atributos: { 'aria-hidden': 'true' } });
  avatar.style.setProperty('--cor-area', cor);
  return avatar;
};

/**
 * Spotlight que segue o cursor em `.spotlight` (mesmo contrato de js/ui/efeitos.js).
 * @returns {void}
 */
export const iniciarSpotlight = () => {
  const ponteiroFino = globalThis.matchMedia('(hover: hover) and (pointer: fine)');
  const reduzido = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  let pendente = 0;
  document.addEventListener('pointermove', (evento) => {
    if (!ponteiroFino.matches || reduzido.matches || pendente) return;
    const alvo = evento.target instanceof Element ? evento.target.closest('.spotlight') : null;
    if (!(alvo instanceof HTMLElement)) return;
    const { clientX, clientY } = evento;
    pendente = requestAnimationFrame(() => {
      pendente = 0;
      const caixa = alvo.getBoundingClientRect();
      alvo.style.setProperty('--spot-x', `${Math.round(clientX - caixa.left)}px`);
      alvo.style.setProperty('--spot-y', `${Math.round(clientY - caixa.top)}px`);
    });
  }, { passive: true });
};
