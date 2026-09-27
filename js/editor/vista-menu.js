/**
 * @file editor/vista-menu.js
 * Vista "Menu do portal": todas as páginas (inclusive rascunhos e linhas com erro) na ordem
 * do menu, com mover, mostrar/ocultar, configurar, editar conteúdo e excluir.
 */

import { hashDaRota } from '../rotas.js';
import { criarElemento } from '../ui/dom.js';
import { criarIcone, iconeExiste } from '../ui/icones.js';
import { NOMES_MODULO, OPCOES_PUBLICO_PAGINA, valorPublicoPagina } from './catalogo.js';
import { criarBotaoAcao, criarSelo } from './componentes.js';

/** @typedef {import('./dados.js').EstruturaEditor} EstruturaEditor */
/** @typedef {import('./dados.js').PaginaEditor} PaginaEditor */

/**
 * @typedef {Object} AcoesMenu
 * @property {function(): void} novaPagina
 * @property {function(string): void} configurarPagina
 * @property {function(string): void} alternarPagina
 * @property {function(string): void} excluirPagina
 * @property {function(string, number): void} moverPagina
 */

/**
 * @param {PaginaEditor} pagina Página.
 * @returns {Array<HTMLElement>} Selos de estado.
 */
const selosDaPagina = (pagina) => {
  const publico = valorPublicoPagina(pagina.papeis);
  const opcao = OPCOES_PUBLICO_PAGINA.find((o) => o.valor === publico);
  return [
    pagina.problema ? criarSelo('Com erro', 'perigo') : null,
    pagina.visivel ? null : criarSelo('Rascunho', 'neutro'),
    pagina.tipo === 'modulo' ? criarSelo(`Módulo: ${NOMES_MODULO[pagina.modulo] || pagina.modulo}`, 'acento') : null,
    publico !== 'todos' && opcao ? criarSelo(opcao.rotulo, 'alerta') : null,
  ].filter(Boolean);
};

/**
 * @param {PaginaEditor} pagina Página.
 * @param {number} indice Posição entre as páginas com id.
 * @param {number} total Total de páginas com id.
 * @param {AcoesMenu} acoes Ações.
 * @returns {HTMLElement} Item da lista.
 */
const criarItemPagina = (pagina, indice, total, acoes) => {
  const editavel = pagina.id !== '' && pagina.problema !== 'id_invalido';
  const meta = pagina.tipo === 'modulo'
    ? `#/${pagina.slug}`
    : `#/${pagina.slug} · ${pagina.total_blocos} ${pagina.total_blocos === 1 ? 'bloco' : 'blocos'}`;
  return criarElemento('li', {
    classe: ['cartao', 'editor-item', pagina.visivel ? '' : 'editor-item--rascunho'],
    atributos: { 'data-pagina': pagina.id },
    filhos: [
      criarElemento('div', {
        classe: 'editor-ordem',
        filhos: [
          criarBotaoAcao({
            icone: 'seta-cima',
            rotulo: `Subir "${pagina.titulo}" no menu`,
            foco: `subir:${pagina.id}`,
            desativado: !editavel || indice === 0,
            aoClicar: () => acoes.moverPagina(pagina.id, -1),
          }),
          criarBotaoAcao({
            icone: 'seta-baixo',
            rotulo: `Descer "${pagina.titulo}" no menu`,
            foco: `descer:${pagina.id}`,
            desativado: !editavel || indice === total - 1,
            aoClicar: () => acoes.moverPagina(pagina.id, 1),
          }),
        ],
      }),
      criarElemento('span', {
        classe: 'icone-caixa editor-item__icone',
        filhos: [criarIcone(iconeExiste(pagina.icone) ? pagina.icone : 'documento')],
      }),
      criarElemento('div', {
        classe: 'editor-item__textos',
        filhos: [
          criarElemento('p', { classe: 'editor-item__titulo', texto: pagina.titulo || '(sem nome)' }),
          criarElemento('p', { classe: 'editor-item__meta', texto: meta }),
          criarElemento('div', { classe: 'editor-item__selos', filhos: selosDaPagina(pagina) }),
          pagina.problema ? criarElemento('p', {
            classe: 'editor-item__problema',
            texto: `${pagina.problema_texto} (linha ${pagina.linha} da aba paginas)`,
          }) : null,
        ],
      }),
      editavel ? criarElemento('div', {
        classe: 'editor-item__acoes',
        filhos: [
          pagina.tipo === 'conteudo' ? criarElemento('a', {
            classe: 'botao botao--primario botao--sm',
            atributos: { href: hashDaRota({ nome: 'editor', paginaId: pagina.id }), 'data-foco': `conteudo:${pagina.id}` },
            filhos: [criarIcone('lapis', 'botao__icone'), criarElemento('span', { classe: 'botao__rotulo', texto: 'Editar conteúdo' })],
          }) : null,
          criarBotaoAcao({
            icone: pagina.visivel ? 'olho' : 'olho-fechado',
            rotulo: pagina.visivel ? `Ocultar "${pagina.titulo}" do menu` : `Mostrar "${pagina.titulo}" no menu`,
            foco: `visivel:${pagina.id}`,
            aoClicar: () => acoes.alternarPagina(pagina.id),
          }),
          criarBotaoAcao({
            icone: 'ajustes',
            rotulo: `Configurar "${pagina.titulo}"`,
            foco: `configurar:${pagina.id}`,
            aoClicar: () => acoes.configurarPagina(pagina.id),
          }),
          criarBotaoAcao({
            icone: 'lixeira',
            rotulo: `Excluir "${pagina.titulo}"`,
            perigo: true,
            foco: `excluir:${pagina.id}`,
            aoClicar: () => acoes.excluirPagina(pagina.id),
          }),
        ],
      }) : null,
    ],
  });
};

/**
 * @param {EstruturaEditor} estrutura Estrutura.
 * @returns {?HTMLElement} Aviso sobre blocos que apontam para páginas inexistentes.
 */
const criarAvisoOrfaos = (estrutura) => {
  const orfaos = estrutura.blocos.filter((b) => b.problema === 'pagina_inexistente');
  if (orfaos.length === 0) return null;
  return criarElemento('aside', {
    classe: 'cartao editor-aviso',
    atributos: { role: 'note' },
    filhos: [
      criarIcone('alerta', 'editor-aviso__icone'),
      criarElemento('p', {
        texto: `${orfaos.length} ${orfaos.length === 1 ? 'bloco aponta' : 'blocos apontam'} para uma página que não existe (linhas ${orfaos.map((b) => b.linha).join(', ')} da aba blocos). Eles não aparecem no portal: corrija o pagina_id na planilha ou apague as linhas.`,
      }),
    ],
  });
};

/**
 * Desenha a vista do menu.
 * @param {EstruturaEditor} estrutura Estrutura.
 * @param {AcoesMenu} acoes Ações.
 * @returns {HTMLElement} Vista.
 */
const criarVistaMenu = (estrutura, acoes) => {
  const comId = estrutura.paginas.filter((p) => p.id !== '' && p.problema !== 'id_invalido');
  const semId = estrutura.paginas.filter((p) => !comId.includes(p));
  return criarElemento('section', {
    classe: 'editor',
    atributos: { 'aria-labelledby': 'tituloPagina' },
    filhos: [
      criarElemento('header', {
        classe: 'editor__cabecalho',
        filhos: [
          criarElemento('div', {
            classe: 'editor__titulos',
            filhos: [
              criarElemento('span', { classe: 'rotulo', texto: 'Editor do portal' }),
              criarElemento('h1', {
                classe: 'titulo-1 texto-gradiente pagina__titulo', texto: 'Menu do portal', atributos: { id: 'tituloPagina', tabindex: '-1' },
              }),
              criarElemento('p', {
                classe: 'texto-mudo editor__lead',
                texto: 'Crie páginas, organize a ordem do menu e edite o conteúdo. O que você salva aparece no portal na hora; itens em rascunho só aparecem aqui.',
              }),
            ],
          }),
          criarElemento('button', {
            classe: 'botao botao--primario',
            atributos: { type: 'button', 'data-foco': 'nova-pagina' },
            filhos: [criarIcone('mais', 'botao__icone'), criarElemento('span', { classe: 'botao__rotulo', texto: 'Nova página' })],
            eventos: { click: () => acoes.novaPagina() },
          }),
        ],
      }),
      criarAvisoOrfaos(estrutura),
      estrutura.paginas.length === 0
        ? criarElemento('div', {
          classe: 'cartao estado',
          filhos: [
            criarElemento('span', { classe: 'icone-caixa', filhos: [criarIcone('estrela')] }),
            criarElemento('div', {
              classe: 'estado__textos',
              filhos: [
                criarElemento('p', { classe: 'estado__titulo', texto: 'O portal ainda não tem páginas.' }),
                criarElemento('p', { classe: 'texto-mudo', texto: 'Crie a primeira em "Nova página". Ela vira um item do menu e um cartão no início.' }),
              ],
            }),
          ],
        })
        : criarElemento('ol', {
          classe: 'editor-lista',
          atributos: { 'aria-label': 'Páginas na ordem do menu' },
          filhos: [
            ...comId.map((p, i) => criarItemPagina(p, i, comId.length, acoes)),
            ...semId.map((p) => criarItemPagina(p, 0, 1, acoes)),
          ],
        }),
    ],
  });
};

export default criarVistaMenu;
