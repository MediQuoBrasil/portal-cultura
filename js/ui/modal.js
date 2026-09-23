/**
 * @file ui/modal.js
 * Modais com `<dialog>` nativo: foco preso, Esc, fundo inerte e retorno de foco vêm do
 * navegador (menos código e mais acessível que overlays manuais). Conteúdo sempre via DOM
 * seguro. Cada modal é criado sob demanda e removido ao fechar.
 */

import { criarElemento } from './dom.js';
import { criarIcone } from './icones.js';

/**
 * @typedef {Object} AcaoModal
 * @property {string} rotulo Texto do botão (verbo que diz o que acontece).
 * @property {'primario'|'secundario'|'fantasma'|'perigo'} [variante='secundario']
 * @property {*} valor Valor com que a promessa resolve.
 * @property {boolean} [autofoco] Recebe o foco ao abrir.
 */

/**
 * @typedef {Object} OpcoesModal
 * @property {string} titulo Título.
 * @property {string} [descricao] Parágrafo curto.
 * @property {Node} [corpo] Conteúdo adicional (já construído com DOM seguro).
 * @property {Array<AcaoModal>} [acoes] Botões do rodapé.
 * @property {boolean} [fecharAoClicarFora=true]
 */

let contador = 0;

/**
 * Abre um modal e resolve com o `valor` da ação escolhida (null ao fechar/cancelar).
 * @param {OpcoesModal} opcoes Opções.
 * @returns {Promise<*>} Valor escolhido ou null.
 */
export const abrirModal = ({
  titulo, descricao, corpo, acoes = [], fecharAoClicarFora = true,
}) => new Promise((resolve) => {
  contador += 1;
  const idTitulo = `modalTitulo${contador}`;
  const idDescricao = descricao ? `modalDescricao${contador}` : undefined;
  let escolhido = null;

  const dialogo = criarElemento('dialog', {
    classe: 'modal',
    atributos: { 'aria-labelledby': idTitulo, 'aria-describedby': idDescricao },
  });

  const fechar = criarElemento('button', {
    classe: 'botao botao--fantasma botao--icone botao--sm',
    atributos: { type: 'button', 'aria-label': 'Fechar' },
    filhos: [criarIcone('fechar', 'botao__icone')],
    eventos: { click: () => dialogo.close() },
  });

  const botoes = acoes.map((acao) => criarElemento('button', {
    classe: `botao botao--${acao.variante || 'secundario'}`,
    atributos: { type: 'button', autofocus: acao.autofoco === true },
    filhos: [criarElemento('span', { classe: 'botao__rotulo', texto: acao.rotulo })],
    eventos: {
      click: () => {
        escolhido = acao.valor;
        dialogo.close();
      },
    },
  }));

  dialogo.append(criarElemento('div', {
    classe: 'cartao modal__cartao',
    filhos: [
      criarElemento('div', {
        classe: 'modal__cabecalho',
        filhos: [criarElemento('h2', { classe: 'modal__titulo', texto: titulo, atributos: { id: idTitulo } }), fechar],
      }),
      descricao ? criarElemento('p', { classe: 'modal__descricao', texto: descricao, atributos: { id: idDescricao } }) : null,
      corpo || null,
      botoes.length > 0 ? criarElemento('div', { classe: 'modal__acoes', filhos: botoes }) : null,
    ],
  }));

  if (fecharAoClicarFora) {
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) dialogo.close();
    });
  }
  dialogo.addEventListener('close', () => {
    dialogo.remove();
    resolve(escolhido);
  }, { once: true });

  document.body.append(dialogo);
  dialogo.showModal();
});

/**
 * Confirmação simples.
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.titulo Título.
 * @param {string} [opcoes.texto] Explicação curta.
 * @param {string} [opcoes.rotuloConfirmar='Confirmar'] Verbo da ação.
 * @param {string} [opcoes.rotuloCancelar='Cancelar'] Rótulo de cancelar.
 * @param {boolean} [opcoes.perigo=false] Ação destrutiva.
 * @returns {Promise<boolean>} true se confirmou.
 */
export const confirmar = async ({
  titulo, texto, rotuloConfirmar = 'Confirmar', rotuloCancelar = 'Cancelar', perigo = false,
}) => (await abrirModal({
  titulo,
  descricao: texto,
  acoes: [
    { rotulo: rotuloCancelar, variante: 'secundario', valor: false },
    {
      rotulo: rotuloConfirmar, variante: perigo ? 'perigo' : 'primario', valor: true, autofoco: true,
    },
  ],
})) === true;
