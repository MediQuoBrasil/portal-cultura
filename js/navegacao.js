/**
 * @file navegacao.js
 * Menu principal: um link por página visível ao usuário (o servidor já filtrou por papel e
 * módulo — aqui não há regra de acesso, só apresentação). Adicionar uma aba ao portal =
 * adicionar uma linha em `paginas`.
 *
 * Com muitas páginas, o menu do desktop rola na horizontal: `data-transborda` liga um
 * esmaecimento nas bordas (CSS) para indicar que há mais itens, e o link da página aberta é
 * trazido para a área visível.
 */

import { hashDaRota } from './rotas.js';
import { criarElemento, exigirElemento } from './ui/dom.js';

/** @typedef {import('./paginas.js').PaginaPublica} PaginaPublica */

/** @type {?ResizeObserver} */
let observadorTamanho = null;

/**
 * Marca em que lados o menu tem itens escondidos (`inicio`, `fim`, `ambos` ou nada).
 * @param {HTMLElement} nav Menu.
 * @returns {void}
 */
const atualizarTransbordo = (nav) => {
  const sobraFim = nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 1;
  const sobraInicio = nav.scrollLeft > 1;
  let valor = null;
  if (sobraInicio && sobraFim) valor = 'ambos';
  else if (sobraFim) valor = 'fim';
  else if (sobraInicio) valor = 'inicio';
  if (valor) nav.setAttribute('data-transborda', valor);
  else nav.removeAttribute('data-transborda');
};

/**
 * Liga (uma vez) a vigilância de tamanho e rolagem do menu.
 * @param {HTMLElement} nav Menu.
 * @returns {void}
 */
const vigiarTransbordo = (nav) => {
  if (observadorTamanho || !('ResizeObserver' in globalThis)) return;
  observadorTamanho = new ResizeObserver(() => atualizarTransbordo(nav));
  observadorTamanho.observe(nav);
  nav.addEventListener('scroll', () => atualizarTransbordo(nav), { passive: true });
};

/**
 * Recria os links do menu.
 * @param {Array<PaginaPublica>} paginas Páginas visíveis, já ordenadas.
 * @returns {void}
 */
export const renderizarNavegacao = (paginas) => {
  const nav = exigirElemento('navPrincipal');
  nav.replaceChildren(...paginas.map((pagina) => criarElemento('a', {
    classe: 'nav__link',
    texto: pagina.titulo,
    atributos: { href: hashDaRota({ nome: 'pagina', slug: pagina.slug }), 'data-slug': pagina.slug },
  })));
  vigiarTransbordo(nav);
  atualizarTransbordo(nav);
};

/**
 * Marca o link da página aberta (`aria-current="page"`) sem recriar o menu e, se ele estiver
 * fora da área visível do menu, rola só o menu até ele.
 * @param {?string} slug Página aberta (null no início).
 * @returns {void}
 */
export const marcarPaginaAtual = (slug) => {
  const nav = exigirElemento('navPrincipal');
  nav.querySelectorAll('.nav__link').forEach((link) => {
    if (link.getAttribute('data-slug') !== slug) {
      link.removeAttribute('aria-current');
      return;
    }
    link.setAttribute('aria-current', 'page');
    const fora = link.offsetLeft < nav.scrollLeft
      || link.offsetLeft + link.offsetWidth > nav.scrollLeft + nav.clientWidth;
    if (fora && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2 });
    }
  });
  atualizarTransbordo(nav);
};
