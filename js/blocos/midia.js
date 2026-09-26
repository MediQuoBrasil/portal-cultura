/**
 * @file blocos/midia.js
 * Mídia dos blocos: monta as URLs a partir do que o servidor já validou (ID do Drive, ID do
 * YouTube ou URL https de host permitido) e cria `<img>`/`<iframe>` com atributos seguros.
 *
 * Segunda barreira (prompt.md §6.2): o servidor filtra por allowlist; aqui o cliente confere
 * de novo o formato do ID e o host, e recusa o resto. Nenhuma URL da planilha vira `src`
 * sem passar por esta porta.
 */

import { HOSTS_IMAGEM } from '../config.js';
import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';
import { ehObjeto } from '../util.js';

/**
 * @typedef {Object} Midia Mídia normalizada pelo servidor (Blocos.gs).
 * @property {'drive'|'youtube'|'url'} tipo
 * @property {string} [id] ID do Drive ou do YouTube.
 * @property {string} [url] URL https já validada.
 */

const REGEX_ID_DRIVE = /^[A-Za-z0-9_-]{20,100}$/;
const REGEX_ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/** Largura pedida às miniaturas do Drive: cobre telas 2x sem baixar o original. */
const LARGURA_MINIATURA = Object.freeze({ padrao: 1600, retrato: 640 });

/**
 * @param {string} host Host em minúsculas.
 * @param {ReadonlyArray<string>} lista Allowlist (subdomínios incluídos).
 * @returns {boolean} true se permitido.
 */
const hostPermitido = (host, lista) => lista.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * @param {*} midia Valor.
 * @returns {boolean} true se tem o shape de Midia com ID/URL coerente com o tipo.
 */
export const ehMidiaValida = (midia) => {
  if (!ehObjeto(midia)) return false;
  if (midia.tipo === 'drive') return REGEX_ID_DRIVE.test(midia.id || '');
  if (midia.tipo === 'youtube') return REGEX_ID_YOUTUBE.test(midia.id || '');
  if (midia.tipo === 'url') return typeof midia.url === 'string';
  return false;
};

/**
 * URL de imagem utilizável como `src` (Drive vira miniatura; URL precisa de host permitido).
 * @param {Midia} midia Mídia.
 * @param {'padrao'|'retrato'} [tamanho='padrao'] Largura da miniatura do Drive.
 * @returns {?string} URL ou null (recusada).
 */
export const urlImagem = (midia, tamanho = 'padrao') => {
  if (!ehMidiaValida(midia)) return null;
  if (midia.tipo === 'drive') {
    return `https://drive.google.com/thumbnail?id=${midia.id}&sz=w${LARGURA_MINIATURA[tamanho]}`;
  }
  if (midia.tipo === 'youtube') return `https://i.ytimg.com/vi/${midia.id}/hqdefault.jpg`;
  try {
    const url = new URL(midia.url);
    if (url.protocol !== 'https:' || !hostPermitido(url.hostname.toLowerCase(), HOSTS_IMAGEM)) return null;
    return url.href;
  } catch (erro) {
    return null;
  }
};

/**
 * @param {string} id ID do YouTube (já validado).
 * @returns {string} URL do player sem cookies de rastreamento até o play.
 */
export const urlVideoEmbed = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`;

/**
 * @param {string} id ID do Drive (já validado).
 * @returns {string} URL da pré-visualização incorporável.
 */
export const urlPreviaDocumento = (id) => `https://drive.google.com/file/d/${id}/preview`;

/**
 * @param {string} id ID do Drive (já validado).
 * @returns {string} URL para abrir/baixar no próprio Drive.
 */
export const urlAbrirDocumento = (id) => `https://drive.google.com/file/d/${id}/view`;

/**
 * Link de bloco: só `https:` e `mailto:` (o host já foi filtrado no servidor).
 * @param {*} link Valor vindo do servidor.
 * @returns {?string} URL ou null.
 */
export const linkSeguro = (link) => {
  if (typeof link !== 'string') return null;
  const s = link.trim();
  if (/^mailto:[^\s<>"']+$/i.test(s)) return s;
  try {
    const url = new URL(s);
    return url.protocol === 'https:' ? url.href : null;
  } catch (erro) {
    return null;
  }
};

/**
 * @param {string} rotulo Texto acessível do espaço vazio.
 * @returns {HTMLElement} Marcador neutro no lugar de uma imagem que não carregou.
 */
const criarMidiaIndisponivel = (rotulo) => criarElemento('div', {
  classe: 'midia-indisponivel',
  atributos: { role: 'img', 'aria-label': rotulo },
  filhos: [criarIcone('imagem', 'midia-indisponivel__icone')],
});

/**
 * Cria uma imagem de bloco. Se a URL for recusada ou o arquivo não carregar (Drive sem
 * compartilhamento, arquivo apagado), mostra um marcador neutro em vez de ícone quebrado.
 * @param {Midia} midia Mídia.
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.alt Texto alternativo ('' para imagem decorativa).
 * @param {string} [opcoes.classe] Classe CSS.
 * @param {'padrao'|'retrato'} [opcoes.tamanho] Largura da miniatura do Drive.
 * @param {boolean} [opcoes.prioridade=false] true para imagem acima da dobra.
 * @returns {HTMLElement} `<img>` ou marcador.
 */
export const criarImagem = (midia, {
  alt, classe = '', tamanho = 'padrao', prioridade = false,
}) => {
  const src = urlImagem(midia, tamanho);
  const rotuloFalha = alt ? `Imagem indisponível: ${alt}` : 'Imagem indisponível';
  const marcador = () => {
    const el = criarMidiaIndisponivel(rotuloFalha);
    if (classe) el.classList.add(...classe.split(/\s+/));
    return el;
  };
  if (!src) return marcador();
  const img = criarElemento('img', {
    classe,
    atributos: {
      src,
      alt,
      loading: prioridade ? 'eager' : 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
    },
  });
  img.addEventListener('error', () => img.replaceWith(marcador()), { once: true });
  return img;
};

/**
 * Cria um iframe de terceiro (YouTube ou Drive) em sandbox, dentro de um quadro com
 * proporção fixa. Só aceita as URLs montadas por este módulo.
 * @param {string} src URL de `urlVideoEmbed` ou `urlPreviaDocumento`.
 * @param {string} titulo Título acessível do quadro.
 * @param {'video'|'documento'} tipo Proporção do quadro.
 * @returns {HTMLElement} Quadro com o iframe.
 */
export const criarQuadroIncorporado = (src, titulo, tipo) => {
  const iframe = criarElemento('iframe', {
    atributos: {
      src,
      title: titulo,
      allow: tipo === 'video' ? 'autoplay; encrypted-media; picture-in-picture; fullscreen' : undefined,
      allowfullscreen: true,
      // O YouTube exige a origem no Referer para tocar o vídeo incorporado.
      referrerpolicy: 'strict-origin-when-cross-origin',
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation',
    },
  });
  return criarElemento('div', { classe: `midia-quadro midia-quadro--${tipo}`, filhos: [iframe] });
};
