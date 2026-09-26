/**
 * @file blocos/modais.js
 * Modais abertos a partir dos blocos (vídeo, documento, perfil de pessoa). Usam o `<dialog>`
 * de ui/modal.js: foco preso, Esc e retorno de foco vêm do navegador. O iframe é criado só
 * ao abrir e sai do DOM ao fechar — o vídeo para sozinho e nada de terceiro carrega antes
 * do clique.
 */

import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';
import { abrirModal } from '../ui/modal.js';
import { carregarMarkdownSeguro, renderizarMarkdown } from './markdown.js';
import {
  criarImagem, criarQuadroIncorporado, urlAbrirDocumento, urlPreviaDocumento, urlVideoEmbed,
} from './midia.js';

/** @typedef {import('./renderizador.js').BlocoPublico} BlocoPublico */

/**
 * Link que abre em nova aba, com aviso para leitor de tela.
 * @param {string} href URL já validada.
 * @param {string} rotulo Texto visível.
 * @param {string} [classe] Classe CSS.
 * @returns {HTMLAnchorElement} Link.
 */
export const criarLinkExterno = (href, rotulo, classe = 'botao botao--secundario') => criarElemento('a', {
  classe,
  atributos: { href, target: '_blank', rel: 'noopener noreferrer' },
  filhos: [
    criarElemento('span', { classe: 'botao__rotulo', texto: rotulo }),
    criarIcone('externo', 'botao__icone'),
    criarElemento('span', { classe: 'sr-only', texto: '(abre em nova aba)' }),
  ],
});

/**
 * @param {BlocoPublico} bloco Bloco `video` (mídia YouTube validada).
 * @returns {Promise<void>} Resolve ao fechar.
 */
export const abrirVideo = async (bloco) => {
  await abrirModal({
    titulo: bloco.titulo,
    tamanho: 'largo',
    corpo: criarQuadroIncorporado(urlVideoEmbed(bloco.midia.id), bloco.titulo, 'video'),
  });
};

/**
 * @param {BlocoPublico} bloco Bloco `documento` (mídia Drive validada).
 * @returns {Promise<void>} Resolve ao fechar.
 */
export const abrirDocumento = async (bloco) => {
  const { id } = bloco.midia;
  await abrirModal({
    titulo: bloco.titulo,
    tamanho: 'largo',
    corpo: criarElemento('div', {
      classe: 'modal-documento',
      filhos: [
        criarQuadroIncorporado(urlPreviaDocumento(id), `Pré-visualização: ${bloco.titulo}`, 'documento'),
        criarElemento('div', {
          classe: 'modal-documento__acoes',
          filhos: [
            criarElemento('p', {
              classe: 'texto-mudo texto-pequeno',
              texto: 'Se a pré-visualização não aparecer, abra o arquivo no Google Drive.',
            }),
            criarLinkExterno(urlAbrirDocumento(id), 'Abrir no Drive'),
          ],
        }),
      ],
    }),
  });
};

/**
 * Perfil completo (foto, cargo e história em Markdown).
 * @param {BlocoPublico} bloco Bloco `pessoa`.
 * @returns {Promise<void>} Resolve ao fechar.
 */
export const abrirPessoa = async (bloco) => {
  const bibliotecas = await carregarMarkdownSeguro();
  await abrirModal({
    titulo: bloco.titulo,
    tamanho: 'largo',
    corpo: criarElemento('div', {
      classe: 'perfil',
      filhos: [
        bloco.midia ? criarImagem(bloco.midia, { alt: '', classe: 'perfil__foto', tamanho: 'retrato' }) : null,
        criarElemento('div', {
          classe: 'perfil__textos',
          filhos: [
            bloco.subtitulo ? criarElemento('p', { classe: 'perfil__cargo', texto: bloco.subtitulo }) : null,
            criarElemento('div', { classe: 'prosa', filhos: [renderizarMarkdown(bloco.texto, bibliotecas)] }),
          ],
        }),
      ],
    }),
  });
};
