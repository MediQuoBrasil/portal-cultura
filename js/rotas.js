/**
 * @file rotas.js
 * Rotas por hash: `#/` é o início e `#/<slug>` é uma página da aba `paginas`.
 *
 * Por que hash e não History API: a Vercel serve a pasta estática como está, sem reescrita
 * para o index; com hash, recarregar ou compartilhar `…/#/protocolos` sempre abre o portal.
 * O hash também sobrevive ao login (a página não muda de endereço).
 *
 * Âncoras comuns (`#conteudo`, do link "Pular para o conteúdo") NÃO são rotas: são
 * ignoradas, senão virariam "página não encontrada".
 */

/** Mesmo formato do servidor (Validacao.gs → REGEX_SLUG). */
const REGEX_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * @typedef {{nome: 'inicio'}|{nome: 'pagina', slug: string}|{nome: 'invalida'}} Rota
 */

/**
 * Interpreta um hash (função pura).
 * @param {string} hash `location.hash`.
 * @returns {?Rota} Rota, ou null quando o hash é uma âncora comum.
 */
export const interpretarHash = (hash) => {
  const valor = typeof hash === 'string' ? hash : '';
  if (valor === '' || valor === '#' || valor === '#/') return { nome: 'inicio' };
  if (!valor.startsWith('#/')) return null;
  const slug = valor.slice(2).split(/[?#/]/)[0].toLowerCase();
  if (!slug) return { nome: 'inicio' };
  return REGEX_SLUG.test(slug) ? { nome: 'pagina', slug } : { nome: 'invalida' };
};

/**
 * @returns {Rota} Rota do endereço atual (âncora comum conta como início).
 */
export const rotaAtual = () => interpretarHash(globalThis.location.hash) || { nome: 'inicio' };

/**
 * @param {Rota} rota Rota.
 * @returns {string} Hash equivalente.
 */
export const hashDaRota = (rota) => (rota.nome === 'pagina' ? `#/${rota.slug}` : '#/');

/**
 * Chama `aoMudar` a cada troca de rota (âncoras comuns não disparam).
 * @param {function(Rota): void} aoMudar Tratador.
 * @returns {function(): void} Função que desliga o ouvinte.
 */
export const ouvirRotas = (aoMudar) => {
  const ouvinte = () => {
    const rota = interpretarHash(globalThis.location.hash);
    if (rota) aoMudar(rota);
  };
  globalThis.addEventListener('hashchange', ouvinte);
  return () => globalThis.removeEventListener('hashchange', ouvinte);
};
