/**
 * @file blocos/markdown.js
 * Markdown dos blocos → fragmento DOM sanitizado.
 *
 * - `marked` e `DOMPurify` ficam em `js/vendor/` com versão fixa (sem CDN: a CSP continua
 *   `script-src 'self'` e a cadeia de fornecimento fica sob controle — prompt.md §12).
 * - Carregamento sob demanda: só baixa (~130 KB antes da compressão) quando a página tem
 *   Markdown; a promessa é memorizada e, se falhar, liberada para nova tentativa.
 * - Saída como DocumentFragment (`RETURN_DOM_FRAGMENT`): nenhum `innerHTML` neste código.
 * - Allowlist curta de tags: sem `<img>` (imagem entra só pelo bloco `imagem`, que passa
 *   pela allowlist de hosts), sem `style`, sem atributos de evento. Links só `https:` e
 *   `mailto:`; externos abrem em nova aba com `noopener noreferrer`.
 * - Cabeçalhos do Markdown descem dois níveis (# vira h3): o h1 é o título da página e o h2
 *   é o título do bloco.
 */

import { logAviso } from '../log.js';

/** @typedef {{marked: Object, purificador: Object}} BibliotecasMarkdown */

const TAGS_PERMITIDAS = Object.freeze([
  'p', 'br', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);
const ATRIBUTOS_PERMITIDOS = Object.freeze(['href', 'title', 'start', 'colspan', 'rowspan']);

/** @type {?Promise<BibliotecasMarkdown>} */
let promessaBibliotecas = null;

/**
 * Ajusta links depois da sanitização: remove `href` fora de https/mailto e força nova aba
 * segura nos externos.
 * @param {Element} no Nó sanitizado.
 * @returns {void}
 */
const ajustarLink = (no) => {
  if (no.tagName !== 'A') return;
  const href = (no.getAttribute('href') || '').trim();
  if (/^mailto:/i.test(href)) return;
  if (!/^https:\/\//i.test(href)) {
    no.removeAttribute('href');
    return;
  }
  no.setAttribute('target', '_blank');
  no.setAttribute('rel', 'noopener noreferrer');
};

/**
 * Carrega e configura as bibliotecas (uma vez por página).
 * @returns {Promise<BibliotecasMarkdown>} Bibliotecas prontas.
 */
export const carregarMarkdown = () => {
  if (promessaBibliotecas) return promessaBibliotecas;
  promessaBibliotecas = Promise.all([
    import('../vendor/marked.esm.js'),
    import('../vendor/purify.es.js'),
  ]).then(([{ Marked }, { default: purificador }]) => {
    const marked = new Marked({ gfm: true, breaks: true, async: false });
    marked.use({
      renderer: {
        heading({ tokens, depth }) {
          const nivel = Math.min(depth + 2, 6);
          return `<h${nivel}>${this.parser.parseInline(tokens)}</h${nivel}>\n`;
        },
      },
    });
    purificador.addHook('afterSanitizeAttributes', ajustarLink);
    return { marked, purificador };
  }).catch((erro) => {
    promessaBibliotecas = null;
    throw erro;
  });
  return promessaBibliotecas;
};

/**
 * Converte Markdown em fragmento sanitizado (bibliotecas já carregadas).
 * @param {string} texto Markdown vindo da planilha.
 * @param {BibliotecasMarkdown} bibliotecas Resultado de `carregarMarkdown`.
 * @returns {DocumentFragment} Fragmento seguro.
 */
export const markdownParaFragmento = (texto, { marked, purificador }) => purificador.sanitize(
  marked.parse(String(texto)),
  {
    ALLOWED_TAGS: [...TAGS_PERMITIDAS],
    ALLOWED_ATTR: [...ATRIBUTOS_PERMITIDOS],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  },
);

/**
 * Fallback sem biblioteca: parágrafos de texto puro.
 * @param {string} texto Texto.
 * @returns {DocumentFragment} Fragmento com `<p>`s.
 */
export const textoParaFragmento = (texto) => {
  const fragmento = document.createDocumentFragment();
  const paragrafos = String(texto).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  paragrafos.forEach((paragrafo) => {
    const p = document.createElement('p');
    p.textContent = paragrafo;
    fragmento.append(p);
  });
  return fragmento;
};

/**
 * Tenta carregar as bibliotecas; em falha (rede, CSP), devolve null e o chamador usa o
 * fallback de texto puro — o conteúdo aparece, só sem formatação.
 * @returns {Promise<?BibliotecasMarkdown>} Bibliotecas ou null.
 */
export const carregarMarkdownSeguro = async () => {
  try {
    return await carregarMarkdown();
  } catch (erro) {
    logAviso('markdown_indisponivel', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
    return null;
  }
};

/**
 * Markdown → fragmento, com fallback de texto puro.
 * @param {string} texto Markdown.
 * @param {?BibliotecasMarkdown} bibliotecas Bibliotecas ou null.
 * @returns {DocumentFragment} Fragmento seguro.
 */
export const renderizarMarkdown = (texto, bibliotecas) => (
  bibliotecas ? markdownParaFragmento(texto, bibliotecas) : textoParaFragmento(texto)
);
