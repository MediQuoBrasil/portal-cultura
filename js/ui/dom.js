/**
 * @file ui/dom.js
 * Construção segura de DOM (padrão de ui.js): `createElement` + `textContent`, nunca
 * `innerHTML` com dado vindo da API ou da planilha. Atributos de evento (`on*`) e URLs com
 * esquema perigoso são recusados na criação.
 */

/**
 * @typedef {Object} OpcoesElemento
 * @property {string|Array<string>} [classe] Classe(s) CSS.
 * @property {string} [texto] Conteúdo textual (via textContent).
 * @property {Object<string, string>} [atributos] Atributos (sem `on*`).
 * @property {Array<Node|string|null|undefined|false>} [filhos] Filhos; strings viram texto.
 * @property {Object<string, EventListener>} [eventos] Ouvintes (`click`, `input`, …).
 */

const ATRIBUTOS_URL = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const ESQUEMAS_SEGUROS = /^(https:|mailto:|#|\/(?!\/))/i;

/**
 * @param {string} nome Nome do atributo.
 * @param {string} valor Valor.
 * @returns {void}
 * @throws {TypeError} Atributo de evento ou URL insegura.
 */
const validarAtributo = (nome, valor) => {
  if (/^on/i.test(nome)) throw new TypeError(`atributo de evento não permitido: ${nome}`);
  if (ATRIBUTOS_URL.has(nome.toLowerCase()) && !ESQUEMAS_SEGUROS.test(String(valor).trim())) {
    throw new TypeError(`URL não permitida em ${nome}`);
  }
};

/**
 * Cria um elemento HTML de forma segura.
 * @param {string} tag Nome da tag.
 * @param {OpcoesElemento} [opcoes] Opções.
 * @returns {HTMLElement} Elemento.
 */
export const criarElemento = (tag, opcoes = {}) => {
  const {
    classe, texto, atributos = {}, filhos = [], eventos = {},
  } = opcoes;
  const elemento = document.createElement(tag);
  if (classe) elemento.classList.add(...(Array.isArray(classe) ? classe : classe.split(/\s+/)).filter(Boolean));
  Object.entries(atributos).forEach(([nome, valor]) => {
    if (valor === undefined || valor === null || valor === false) return;
    validarAtributo(nome, valor);
    elemento.setAttribute(nome, valor === true ? '' : String(valor));
  });
  if (typeof texto === 'string') elemento.textContent = texto;
  elemento.append(...filhos.filter((f) => f !== null && f !== undefined && f !== false));
  Object.entries(eventos).forEach(([nome, ouvinte]) => elemento.addEventListener(nome, ouvinte));
  return elemento;
};

/**
 * @param {string} id ID do elemento.
 * @returns {HTMLElement} Elemento.
 * @throws {Error} Se não existir (erro de marcação, não de dado).
 */
export const exigirElemento = (id) => {
  const elemento = document.getElementById(id);
  if (!elemento) throw new Error(`elemento #${id} ausente no HTML`);
  return elemento;
};

/**
 * Substitui o texto de um elemento.
 * @param {Element} elemento Alvo.
 * @param {string} texto Texto.
 * @returns {void}
 */
export const definirTexto = (elemento, texto) => {
  elemento.replaceChildren(document.createTextNode(texto));
};
