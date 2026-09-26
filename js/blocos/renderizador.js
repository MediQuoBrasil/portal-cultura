/**
 * @file blocos/renderizador.js
 * Renderizador de blocos "estilo Wix": cada bloco validado pelo servidor (Blocos.gs) vira DOM
 * por um `switch(tipo)`. É a MESMA função que a pré-visualização do editor vai usar: o que o
 * admin vê antes de salvar é o que o profissional vê depois.
 *
 * Regras:
 * - Bloco com shape inesperado ou tipo desconhecido é IGNORADO e logado — nunca quebra a
 *   página (espelha a regra do servidor). Criar um tipo novo = `case` novo aqui + contrato
 *   novo em `CONTRATOS_BLOCO` (Blocos.gs).
 * - Consecutivos de tipos agrupáveis (`card`, `pessoa`, lista vinda do servidor) viram uma
 *   grade; `timeline` consecutivos viram uma única linha do tempo.
 * - Texto sempre por `textContent`; Markdown só pelo módulo sanitizado; mídia só pela porta
 *   de blocos/midia.js.
 */

import { logAviso } from '../log.js';
import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';
import { carregarMarkdownSeguro, renderizarMarkdown } from './markdown.js';
import {
  abrirDocumento, abrirPessoa, abrirVideo, criarLinkExterno,
} from './modais.js';
import { criarImagem, ehMidiaValida, linkSeguro } from './midia.js';

/** @typedef {import('./midia.js').Midia} Midia */
/** @typedef {import('./markdown.js').BibliotecasMarkdown} BibliotecasMarkdown */

/**
 * @typedef {'markdown'|'destaque'|'card'|'pessoa'|'timeline'|'documento'|'video'|'imagem'|'link'}
 *   TipoBloco
 */

/**
 * @typedef {Object} BlocoPublico Bloco como o servidor entrega (shape sempre completo).
 * @property {string} id
 * @property {TipoBloco} tipo
 * @property {number} ordem
 * @property {string} titulo
 * @property {string} subtitulo
 * @property {string} texto
 * @property {?Midia} midia
 * @property {?string} link
 * @property {string} versao
 * @property {string} vigente_desde `yyyy-MM-dd` ou ''.
 * @property {?Array<string>} publico
 */

/**
 * @typedef {Object} OpcoesRender
 * @property {ReadonlyArray<string>} [tiposAgrupaveis] Vindos do servidor (`tipos_agrupaveis`).
 */

/**
 * @typedef {Object} GrupoBlocos
 * @property {'unico'|'grade'|'linha-tempo'} forma
 * @property {TipoBloco} tipo
 * @property {Array<BlocoPublico>} blocos
 */

/** Tipos que este cliente sabe desenhar. */
export const TIPOS_CONHECIDOS = Object.freeze([
  'markdown', 'destaque', 'card', 'pessoa', 'timeline', 'documento', 'video', 'imagem', 'link',
]);

/** Padrão local caso o servidor não mande a lista (mesmo valor de Blocos.gs). */
const AGRUPAVEIS_PADRAO = Object.freeze(['card', 'pessoa']);

/**
 * Mídia exigida por tipo (o servidor já exige; aqui evita render quebrado).
 * `null` = qualquer mídia válida.
 */
const MIDIA_OBRIGATORIA = Object.freeze({
  documento: 'drive', video: 'youtube', imagem: null,
});

/**
 * @param {*} valor Valor.
 * @returns {string} String ou ''.
 */
const texto = (valor) => (typeof valor === 'string' ? valor : '');

/**
 * Normaliza um bloco vindo da rede/cache. Não confia no shape: campo de tipo errado vira
 * vazio; mídia fora do formato vira null.
 * @param {*} bruto Valor.
 * @returns {?BlocoPublico} Bloco ou null (ignorado).
 */
export const normalizarBloco = (bruto) => {
  if (!bruto || typeof bruto !== 'object' || !TIPOS_CONHECIDOS.includes(bruto.tipo)) return null;
  const bloco = {
    id: texto(bruto.id),
    tipo: bruto.tipo,
    ordem: Number.isFinite(bruto.ordem) ? bruto.ordem : 0,
    titulo: texto(bruto.titulo),
    subtitulo: texto(bruto.subtitulo),
    texto: texto(bruto.texto),
    midia: ehMidiaValida(bruto.midia) ? bruto.midia : null,
    link: linkSeguro(bruto.link),
    versao: texto(bruto.versao),
    vigente_desde: texto(bruto.vigente_desde),
    publico: Array.isArray(bruto.publico) ? bruto.publico.filter((p) => typeof p === 'string') : null,
  };
  const esperada = MIDIA_OBRIGATORIA[bloco.tipo];
  if (esperada !== undefined) {
    if (!bloco.midia || (esperada && bloco.midia.tipo !== esperada)) return null;
  }
  if (bloco.tipo === 'link' && !bloco.link) return null;
  return bloco;
};

/**
 * Agrupa blocos consecutivos (função pura — testável sem DOM).
 * @param {Array<BlocoPublico>} blocos Blocos já normalizados, na ordem.
 * @param {ReadonlyArray<string>} tiposAgrupaveis Tipos que viram grade.
 * @returns {Array<GrupoBlocos>} Grupos na ordem original.
 */
export const agruparBlocos = (blocos, tiposAgrupaveis) => blocos.reduce((grupos, bloco) => {
  let forma = 'unico';
  if (tiposAgrupaveis.includes(bloco.tipo)) forma = 'grade';
  else if (bloco.tipo === 'timeline') forma = 'linha-tempo';
  const anterior = grupos[grupos.length - 1];
  if (forma !== 'unico' && anterior && anterior.forma === forma && anterior.tipo === bloco.tipo) {
    anterior.blocos.push(bloco);
  } else {
    grupos.push({ forma, tipo: bloco.tipo, blocos: [bloco] });
  }
  return grupos;
}, []);

/**
 * @param {string} data `yyyy-MM-dd`.
 * @returns {string} `dd/mm/aaaa` ou o próprio valor se não reconhecido.
 */
const formatarData = (data) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data;
};

/**
 * @param {string} titulo Título do bloco ('' = sem cabeçalho).
 * @returns {?HTMLElement} `<h2>` ou null.
 */
const criarTituloBloco = (titulo) => (titulo ? criarElemento('h2', { classe: 'titulo-2 bloco__titulo', texto: titulo }) : null);

// ─── Um construtor por tipo ─────────────────────────────────────────────────────────────

/**
 * @param {BlocoPublico} bloco Bloco.
 * @param {?BibliotecasMarkdown} bibliotecas Markdown (null = texto puro).
 * @returns {HTMLElement} Seção de texto longo.
 */
const criarMarkdown = (bloco, bibliotecas) => criarElemento('section', {
  classe: 'bloco bloco--markdown',
  filhos: [
    criarTituloBloco(bloco.titulo),
    criarElemento('div', { classe: 'prosa', filhos: [renderizarMarkdown(bloco.texto, bibliotecas)] }),
  ],
});

/**
 * @param {BlocoPublico} bloco Bloco.
 * @returns {HTMLElement} Frase forte (missão, visão, aviso).
 */
const criarDestaque = (bloco) => criarElemento('aside', {
  classe: 'bloco bloco--destaque cartao cartao--gradiente',
  filhos: [
    bloco.titulo ? criarElemento('h2', { classe: 'destaque__titulo', texto: bloco.titulo }) : null,
    criarElemento('p', { classe: 'destaque__texto', texto: bloco.texto }),
  ],
});

/**
 * @param {BlocoPublico} bloco Bloco.
 * @returns {HTMLElement} Card (valor, produto).
 */
const criarCard = (bloco) => criarElemento('article', {
  classe: 'cartao spotlight card',
  filhos: [
    bloco.midia ? criarImagem(bloco.midia, { alt: '', classe: 'card__midia' }) : null,
    criarElemento('h3', { classe: 'card__titulo', texto: bloco.titulo }),
    bloco.subtitulo ? criarElemento('p', { classe: 'card__subtitulo', texto: bloco.subtitulo }) : null,
    bloco.texto ? criarElemento('p', { classe: 'card__texto', texto: bloco.texto }) : null,
    bloco.link ? criarLinkExterno(bloco.link, 'Abrir', 'botao botao--fantasma botao--sm card__link') : null,
  ],
});

/**
 * Pessoa com história vira botão que abre o perfil; sem história, só o cartão.
 * @param {BlocoPublico} bloco Bloco.
 * @returns {HTMLElement} Cartão de perfil.
 */
const criarPessoa = (bloco) => {
  const filhos = [
    bloco.midia
      ? criarImagem(bloco.midia, { alt: '', classe: 'pessoa__foto', tamanho: 'retrato' })
      : criarElemento('div', { classe: 'pessoa__foto pessoa__foto--vazia', atributos: { 'aria-hidden': 'true' } }),
    criarElemento('span', { classe: 'pessoa__nome', texto: bloco.titulo }),
    bloco.subtitulo ? criarElemento('span', { classe: 'pessoa__cargo', texto: bloco.subtitulo }) : null,
  ];
  if (!bloco.texto) return criarElemento('article', { classe: 'cartao pessoa', filhos });
  return criarElemento('button', {
    classe: 'cartao cartao--interativo spotlight pessoa',
    atributos: { type: 'button', 'aria-haspopup': 'dialog' },
    filhos: [...filhos, criarElemento('span', { classe: 'pessoa__acao', texto: 'Ler a história' })],
    eventos: { click: () => { abrirPessoa(bloco); } },
  });
};

/**
 * @param {BlocoPublico} bloco Bloco.
 * @returns {HTMLElement} Item da linha do tempo.
 */
const criarItemLinhaTempo = (bloco) => criarElemento('li', {
  classe: 'linha-tempo__item',
  filhos: [
    criarElemento('span', { classe: 'linha-tempo__marco', texto: bloco.titulo }),
    criarElemento('p', { classe: 'linha-tempo__texto', texto: bloco.texto }),
  ],
});

/**
 * @param {BlocoPublico} bloco Bloco (mídia Drive).
 * @returns {HTMLElement} Cartão do documento com metadados e ação.
 */
const criarDocumento = (bloco) => criarElemento('article', {
  classe: 'bloco cartao documento',
  filhos: [
    criarElemento('span', { classe: 'icone-caixa', filhos: [criarIcone('documento')] }),
    criarElemento('div', {
      classe: 'documento__corpo',
      filhos: [
        criarElemento('h2', { classe: 'documento__titulo', texto: bloco.titulo }),
        (bloco.versao || bloco.vigente_desde) ? criarElemento('p', {
          classe: 'documento__meta',
          filhos: [
            bloco.versao ? criarElemento('span', { classe: 'selo selo--neutro', texto: `Versão ${bloco.versao}` }) : null,
            bloco.vigente_desde ? criarElemento('span', {
              classe: 'texto-mudo texto-pequeno',
              texto: `Vigente desde ${formatarData(bloco.vigente_desde)}`,
            }) : null,
          ],
        }) : null,
        bloco.texto ? criarElemento('p', { classe: 'documento__resumo', texto: bloco.texto }) : null,
        criarElemento('div', {
          classe: 'documento__acoes',
          filhos: [
            criarElemento('button', {
              classe: 'botao botao--secundario botao--sm',
              atributos: { type: 'button', 'aria-haspopup': 'dialog' },
              filhos: [criarElemento('span', { classe: 'botao__rotulo', texto: 'Ver documento' })],
              eventos: { click: () => { abrirDocumento(bloco); } },
            }),
          ],
        }),
      ],
    }),
  ],
});

/**
 * Miniatura clicável: o player do YouTube só carrega depois do clique.
 * @param {BlocoPublico} bloco Bloco (mídia YouTube).
 * @returns {HTMLElement} Botão com miniatura.
 */
const criarVideo = (bloco) => criarElemento('button', {
  classe: 'bloco video',
  atributos: { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': `Assistir: ${bloco.titulo}` },
  eventos: { click: () => { abrirVideo(bloco); } },
  filhos: [
    criarElemento('span', {
      classe: 'video__quadro',
      filhos: [
        criarImagem(bloco.midia, { alt: '', classe: 'video__miniatura' }),
        criarElemento('span', { classe: 'video__play', filhos: [criarIcone('play')] }),
      ],
    }),
    criarElemento('span', { classe: 'video__titulo', texto: bloco.titulo }),
  ],
});

/**
 * @param {BlocoPublico} bloco Bloco (`titulo` é o texto alternativo).
 * @returns {HTMLElement} Figura responsiva.
 */
const criarImagemBloco = (bloco) => criarElemento('figure', {
  classe: 'bloco bloco--imagem',
  filhos: [criarImagem(bloco.midia, { alt: bloco.titulo, classe: 'bloco-imagem__img' })],
});

/**
 * @param {BlocoPublico} bloco Bloco (link já validado).
 * @returns {HTMLElement} Botão de recurso externo.
 */
const criarLink = (bloco) => criarElemento('p', {
  classe: 'bloco bloco--link',
  filhos: [criarLinkExterno(bloco.link, bloco.titulo)],
});

/**
 * O `switch(tipo)` do modelo "estilo Wix".
 * @param {BlocoPublico} bloco Bloco normalizado.
 * @param {?BibliotecasMarkdown} bibliotecas Markdown (null = texto puro).
 * @returns {HTMLElement} Elemento do bloco.
 */
export const criarBloco = (bloco, bibliotecas) => {
  switch (bloco.tipo) {
    case 'markdown': return criarMarkdown(bloco, bibliotecas);
    case 'destaque': return criarDestaque(bloco);
    case 'card': return criarCard(bloco);
    case 'pessoa': return criarPessoa(bloco);
    case 'timeline': return criarItemLinhaTempo(bloco);
    case 'documento': return criarDocumento(bloco);
    case 'video': return criarVideo(bloco);
    case 'imagem': return criarImagemBloco(bloco);
    case 'link': return criarLink(bloco);
    default: throw new TypeError(`tipo sem renderizador: ${bloco.tipo}`);
  }
};

/**
 * Constrói um bloco isolando a falha: bloco que quebra some e é logado.
 * @param {BlocoPublico} bloco Bloco.
 * @param {?BibliotecasMarkdown} bibliotecas Markdown.
 * @returns {?HTMLElement} Elemento ou null.
 */
const criarBlocoIsolado = (bloco, bibliotecas) => {
  try {
    return criarBloco(bloco, bibliotecas);
  } catch (erro) {
    logAviso('bloco_nao_renderizado', { id: bloco.id, tipo: bloco.tipo, motivo: erro instanceof Error ? erro.message : 'desconhecido' });
    return null;
  }
};

/**
 * @param {GrupoBlocos} grupo Grupo.
 * @param {?BibliotecasMarkdown} bibliotecas Markdown.
 * @returns {?HTMLElement} Elemento do grupo (null se todos falharem).
 */
const criarGrupo = (grupo, bibliotecas) => {
  const itens = grupo.blocos.map((b) => criarBlocoIsolado(b, bibliotecas)).filter(Boolean);
  if (itens.length === 0) return null;
  if (grupo.forma === 'unico') return itens[0];
  if (grupo.forma === 'linha-tempo') {
    return criarElemento('ol', { classe: 'bloco linha-tempo', filhos: itens });
  }
  return criarElemento('div', { classe: `bloco grade grade--${grupo.tipo}`, filhos: itens });
};

/**
 * Renderiza uma lista de blocos (página ou pré-visualização do editor).
 * Carrega o Markdown só se algum bloco precisar dele.
 * @param {Array<*>} blocosBrutos Blocos como vieram do servidor/cache.
 * @param {OpcoesRender} [opcoes] Opções.
 * @returns {Promise<{fragmento: DocumentFragment, total: number}>} DOM pronto e quantos
 *   blocos foram desenhados (0 = página vazia).
 */
export const renderizarBlocos = async (
  blocosBrutos,
  { tiposAgrupaveis = AGRUPAVEIS_PADRAO } = {},
) => {
  const lista = Array.isArray(blocosBrutos) ? blocosBrutos : [];
  const blocos = lista.map(normalizarBloco).filter(Boolean);
  if (blocos.length < lista.length) {
    logAviso('blocos_ignorados_no_cliente', { total: lista.length - blocos.length });
  }
  const precisaMarkdown = blocos.some((b) => b.tipo === 'markdown');
  const bibliotecas = precisaMarkdown ? await carregarMarkdownSeguro() : null;
  const fragmento = document.createDocumentFragment();
  let total = 0;
  agruparBlocos(blocos, tiposAgrupaveis).forEach((grupo) => {
    const elemento = criarGrupo(grupo, bibliotecas);
    if (!elemento) return;
    elemento.setAttribute('data-revelar', '');
    fragmento.append(elemento);
    total += grupo.blocos.length;
  });
  return { fragmento, total };
};
