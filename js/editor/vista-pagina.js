/**
 * @file editor/vista-pagina.js
 * Vista "Editando página": os blocos na ordem, cada um desenhado com o renderizador do
 * portal dentro de uma moldura de edição (mover, publicar/ocultar, editar, excluir), com um
 * "Adicionar bloco" entre cada par. O modo "Pré-visualizar" mostra a página exatamente como
 * o portal vai mostrar: só blocos publicados e válidos, agrupados em grade e linha do tempo.
 */

import { renderizarBlocos } from '../blocos/renderizador.js';
import { logAviso } from '../log.js';
import { hashDaRota } from '../rotas.js';
import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';
import { NOMES_MODULO, TIPOS_BLOCO, rotuloEspecialidade } from './catalogo.js';
import { criarBotaoAcao, criarEstadoEditor, criarSelo } from './componentes.js';

/** @typedef {import('./dados.js').EstruturaEditor} EstruturaEditor */
/** @typedef {import('./dados.js').PaginaEditor} PaginaEditor */
/** @typedef {import('./dados.js').BlocoEditor} BlocoEditor */

/**
 * @typedef {Object} AcoesPagina
 * @property {function(string): void} configurarPagina
 * @property {function(string, number): void} novoBloco Página e posição.
 * @property {function(string): void} editarBloco
 * @property {function(string): void} alternarBloco
 * @property {function(string): void} excluirBloco
 * @property {function(string, number): void} moverBloco
 * @property {function('editar'|'previa'): void} alternarModo
 */

/**
 * @param {EstruturaEditor} estrutura Estrutura.
 * @param {string} paginaId Página.
 * @returns {Array<BlocoEditor>} Blocos da página na ordem.
 */
export const blocosDaPagina = (estrutura, paginaId) => estrutura.blocos
  .filter((b) => b.pagina_id === paginaId);

/**
 * @param {BlocoEditor} bloco Bloco.
 * @returns {string} Nome curto para rótulos acessíveis.
 */
const nomeDoBloco = (bloco) => {
  const tipo = TIPOS_BLOCO[bloco.tipo] ? TIPOS_BLOCO[bloco.tipo].nome : bloco.tipo;
  const resumo = (bloco.titulo || bloco.texto).replace(/\s+/g, ' ').trim().slice(0, 40);
  return resumo ? `${tipo} "${resumo}"` : tipo;
};

/**
 * @param {string} paginaId Página.
 * @param {number} posicao Posição de inserção.
 * @param {AcoesPagina} acoes Ações.
 * @param {boolean} [destaque=false] Botão grande (página vazia).
 * @returns {HTMLElement} Item com o botão "Adicionar bloco".
 */
const criarInsercao = (paginaId, posicao, acoes, destaque = false) => criarElemento('li', {
  classe: ['editor-inserir', destaque ? 'editor-inserir--destaque' : ''],
  filhos: [criarElemento('button', {
    classe: destaque ? 'botao botao--primario' : 'botao botao--fantasma botao--sm editor-inserir__botao',
    atributos: { type: 'button', 'data-foco': `inserir:${posicao}` },
    filhos: [
      criarIcone('mais', 'botao__icone'),
      criarElemento('span', { classe: 'botao__rotulo', texto: destaque ? 'Adicionar o primeiro bloco' : 'Adicionar bloco aqui' }),
    ],
    eventos: { click: () => acoes.novoBloco(paginaId, posicao) },
  })],
});

/**
 * @param {BlocoEditor} bloco Bloco.
 * @param {number} indice Posição.
 * @param {number} total Total de blocos.
 * @param {AcoesPagina} acoes Ações.
 * @returns {{item: HTMLElement, conteudo: HTMLElement}} Moldura e área onde a prévia entra.
 */
const criarMoldura = (bloco, indice, total, acoes) => {
  const info = TIPOS_BLOCO[bloco.tipo];
  const nome = nomeDoBloco(bloco);
  const conteudo = criarElemento('div', { classe: 'editor-bloco__conteudo' });
  if (bloco.problema) {
    conteudo.append(criarElemento('div', {
      classe: 'editor-bloco__erro',
      atributos: { role: 'note' },
      filhos: [
        criarIcone('alerta', 'editor-bloco__erro-icone'),
        criarElemento('p', { texto: `${bloco.problema_texto} Este bloco não aparece no portal até ser corrigido.` }),
      ],
    }));
  } else {
    conteudo.append(criarElemento('div', { classe: 'esqueleto esqueleto--bloco' }));
  }
  const item = criarElemento('li', {
    classe: ['editor-bloco', bloco.visivel ? '' : 'editor-bloco--rascunho', bloco.problema ? 'editor-bloco--erro' : ''],
    atributos: { 'data-bloco': bloco.id, 'aria-label': nome },
    filhos: [
      criarElemento('div', {
        classe: 'editor-bloco__barra',
        filhos: [
          criarElemento('span', {
            classe: 'editor-bloco__tipo',
            filhos: [criarIcone(info ? info.icone : 'info', 'editor-bloco__tipo-icone'), info ? info.nome : bloco.tipo],
          }),
          criarElemento('span', {
            classe: 'editor-bloco__selos',
            filhos: [
              bloco.problema ? criarSelo('Com erro', 'perigo') : null,
              bloco.visivel ? null : criarSelo('Rascunho', 'neutro'),
              bloco.publico.length > 0 ? criarSelo(`Só ${bloco.publico.map(rotuloEspecialidade).join(', ')}`, 'alerta') : null,
            ],
          }),
          criarElemento('span', {
            classe: 'editor-bloco__acoes',
            filhos: [
              criarBotaoAcao({
                icone: 'seta-cima',
                rotulo: `Subir ${nome}`,
                foco: `subir:${bloco.id}`,
                desativado: indice === 0,
                aoClicar: () => acoes.moverBloco(bloco.id, -1),
              }),
              criarBotaoAcao({
                icone: 'seta-baixo',
                rotulo: `Descer ${nome}`,
                foco: `descer:${bloco.id}`,
                desativado: indice === total - 1,
                aoClicar: () => acoes.moverBloco(bloco.id, 1),
              }),
              criarBotaoAcao({
                icone: bloco.visivel ? 'olho' : 'olho-fechado',
                rotulo: bloco.visivel ? `Ocultar ${nome} (vira rascunho)` : `Publicar ${nome}`,
                foco: `visivel:${bloco.id}`,
                aoClicar: () => acoes.alternarBloco(bloco.id),
              }),
              criarBotaoAcao({
                icone: 'lapis', rotulo: `Editar ${nome}`, foco: `editar:${bloco.id}`, aoClicar: () => acoes.editarBloco(bloco.id),
              }),
              criarBotaoAcao({
                icone: 'lixeira',
                rotulo: `Excluir ${nome}`,
                perigo: true,
                foco: `excluir:${bloco.id}`,
                aoClicar: () => acoes.excluirBloco(bloco.id),
              }),
            ],
          }),
        ],
      }),
      conteudo,
    ],
  });
  return { item, conteudo };
};

/**
 * @param {PaginaEditor} pagina Página.
 * @param {AcoesPagina} acoes Ações.
 * @returns {HTMLElement} Cabeçalho da vista.
 */
const criarCabecalhoPagina = (pagina, acoes) => criarElemento('header', {
  classe: 'editor__cabecalho',
  filhos: [
    criarElemento('div', {
      classe: 'editor__titulos',
      filhos: [
        criarElemento('a', {
          classe: 'editor__voltar',
          atributos: { href: hashDaRota({ nome: 'editor', paginaId: null }), 'data-foco': 'voltar' },
          filhos: [criarIcone('voltar', 'editor__voltar-icone'), 'Menu do portal'],
        }),
        criarElemento('h1', {
          classe: 'titulo-1 texto-gradiente pagina__titulo', texto: pagina.titulo || '(sem nome)', atributos: { id: 'tituloPagina', tabindex: '-1' },
        }),
        criarElemento('div', {
          classe: 'editor-item__selos',
          filhos: [
            pagina.visivel ? criarSelo('No menu', 'sucesso') : criarSelo('Rascunho: fora do menu', 'neutro'),
            pagina.problema ? criarSelo(pagina.problema_texto, 'perigo') : null,
          ],
        }),
      ],
    }),
    criarElemento('div', {
      classe: 'editor__acoes-cabecalho',
      filhos: [
        criarElemento('button', {
          classe: 'botao botao--secundario botao--sm',
          atributos: { type: 'button', 'data-foco': 'configurar-pagina' },
          filhos: [criarIcone('ajustes', 'botao__icone'), criarElemento('span', { classe: 'botao__rotulo', texto: 'Configurar página' })],
          eventos: { click: () => acoes.configurarPagina(pagina.id) },
        }),
        pagina.visivel && !pagina.problema ? criarElemento('a', {
          classe: 'botao botao--fantasma botao--sm',
          atributos: { href: hashDaRota({ nome: 'pagina', slug: pagina.slug }) },
          filhos: [criarIcone('olho', 'botao__icone'), criarElemento('span', { classe: 'botao__rotulo', texto: 'Ver no portal' })],
        }) : null,
      ],
    }),
  ],
});

/**
 * @param {'editar'|'previa'} modo Modo atual.
 * @param {AcoesPagina} acoes Ações.
 * @returns {HTMLElement} Alternador de modo.
 */
const criarAlternadorModo = (modo, acoes) => criarElemento('div', {
  classe: 'editor-modos',
  atributos: { role: 'group', 'aria-label': 'Modo de visualização' },
  filhos: [['editar', 'Editar blocos', 'lapis'], ['previa', 'Pré-visualizar', 'olho']].map(([valor, rotulo, icone]) => criarElemento('button', {
    classe: 'editor-modos__botao',
    atributos: { type: 'button', 'aria-pressed': String(modo === valor), 'data-foco': `modo:${valor}` },
    filhos: [criarIcone(icone, 'botao__icone'), criarElemento('span', { texto: rotulo })],
    eventos: { click: () => acoes.alternarModo(valor) },
  })),
});

/**
 * Preenche as molduras com a prévia real de cada bloco (assíncrono: o Markdown pode carregar).
 * @param {Array<{bloco: BlocoEditor, conteudo: HTMLElement}>} molduras Molduras.
 * @param {EstruturaEditor} estrutura Estrutura.
 * @param {function(): boolean} vigente false se outra renderização já começou.
 * @returns {Promise<void>}
 */
const preencherPrevias = async (molduras, estrutura, vigente) => {
  const comPrevia = molduras.filter(({ bloco }) => bloco.previa);
  const resultados = await Promise.all(comPrevia.map(({ bloco }) => renderizarBlocos(
    [bloco.previa],
    { tiposAgrupaveis: estrutura.tiposAgrupaveis },
  ).catch((erro) => {
    logAviso('editor_previa_bloco_falhou', { id: bloco.id, motivo: erro instanceof Error ? erro.name : 'desconhecido' });
    return null;
  })));
  if (!vigente()) return;
  comPrevia.forEach(({ conteudo }, i) => {
    const resultado = resultados[i];
    conteudo.replaceChildren(resultado && resultado.total > 0 ? resultado.fragmento : criarElemento('p', {
      classe: 'texto-mudo texto-pequeno', texto: 'Não foi possível desenhar a prévia deste bloco.',
    }));
  });
};

/**
 * Desenha a vista da página.
 * @param {Object} opcoes Opções.
 * @param {EstruturaEditor} opcoes.estrutura Estrutura.
 * @param {PaginaEditor} opcoes.pagina Página.
 * @param {'editar'|'previa'} opcoes.modo Modo.
 * @param {AcoesPagina} opcoes.acoes Ações.
 * @param {function(): boolean} opcoes.vigente Guarda de corrida para a parte assíncrona.
 * @returns {HTMLElement} Vista.
 */
const criarVistaPagina = ({
  estrutura, pagina, modo, acoes, vigente,
}) => {
  const secao = criarElemento('section', {
    classe: 'editor',
    atributos: { 'aria-labelledby': 'tituloPagina' },
    filhos: [criarCabecalhoPagina(pagina, acoes)],
  });

  if (pagina.tipo === 'modulo') {
    secao.append(criarEstadoEditor({
      titulo: `Esta é uma página de módulo: ${NOMES_MODULO[pagina.modulo] || pagina.modulo}.`,
      texto: 'Ela mostra um recurso pronto do portal e não recebe blocos. Em "Configurar página" você muda nome, ícone, quem vê e se aparece no menu.',
      icone: 'estrela',
    }));
    return secao;
  }

  const blocos = blocosDaPagina(estrutura, pagina.id);
  secao.append(criarAlternadorModo(modo, acoes));

  if (modo === 'previa') {
    const area = criarElemento('div', {
      classe: 'blocos editor-previa-pagina',
      atributos: { 'aria-busy': 'true' },
      filhos: [criarElemento('div', { classe: 'esqueleto esqueleto--bloco' })],
    });
    secao.append(area);
    const publicados = blocos.filter((b) => b.visivel && b.previa).map((b) => b.previa);
    renderizarBlocos(publicados, { tiposAgrupaveis: estrutura.tiposAgrupaveis })
      .then(({ fragmento, total }) => {
        if (!vigente()) return;
        area.replaceChildren(total > 0 ? fragmento : criarEstadoEditor({
          titulo: 'Nada publicado nesta página ainda.',
          texto: 'Blocos em rascunho ou com erro não aparecem no portal.',
        }));
        area.removeAttribute('aria-busy');
      })
      .catch((erro) => logAviso('editor_previa_pagina_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' }));
    return secao;
  }

  if (blocos.length === 0) {
    secao.append(criarElemento('ol', {
      classe: 'editor-blocos',
      atributos: { 'aria-label': 'Blocos da página' },
      filhos: [criarInsercao(pagina.id, 0, acoes, true)],
    }));
    return secao;
  }

  const molduras = blocos.map((bloco, i) => ({
    bloco, ...criarMoldura(bloco, i, blocos.length, acoes),
  }));
  secao.append(criarElemento('ol', {
    classe: 'editor-blocos',
    atributos: { 'aria-label': 'Blocos da página' },
    filhos: [
      criarInsercao(pagina.id, 0, acoes),
      ...molduras.flatMap(({ item }, i) => [item, criarInsercao(pagina.id, i + 1, acoes)]),
    ],
  }));
  preencherPrevias(molduras, estrutura, vigente);
  return secao;
};

export default criarVistaPagina;
