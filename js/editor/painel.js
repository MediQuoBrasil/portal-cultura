/**
 * @file editor/painel.js
 * Painel de edição em `<dialog>` nativo (foco preso, Esc e fundo inerte vêm do navegador).
 * Diferente de `ui/modal.js`, o painel NÃO fecha ao clicar em Salvar: espera o servidor,
 * mostra o erro dentro do próprio painel e só fecha quando a gravação deu certo.
 *
 * Alterações não salvas: fechar (Esc, X, Cancelar, clique fora) pede confirmação.
 */

import { ErroApi } from '../api.js';
import { logErro } from '../log.js';
import definirCarregando from '../ui/carregando.js';
import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';
import { confirmar } from '../ui/modal.js';

/**
 * @typedef {Object} OpcoesPainel
 * @property {string} titulo Título.
 * @property {string} [descricao] Frase curta abaixo do título.
 * @property {HTMLElement} corpo Campos (DOM seguro). Vai dentro de um `<form>`.
 * @property {string} [rotuloSalvar='Salvar'] Verbo do botão principal.
 * @property {'padrao'|'largo'} [tamanho='padrao']
 * @property {function(): Promise<void>} aoSalvar Grava; lança para mostrar erro.
 */

/** @type {?HTMLDialogElement} */
let painelAberto = null;

let contador = 0;

/**
 * Mensagem segura de um erro de gravação.
 * @param {*} erro Erro.
 * @returns {string} Texto para o painel.
 */
export const mensagemDeErro = (erro) => {
  if (erro instanceof ErroApi) return erro.message;
  if (erro instanceof Error && erro.name === 'ErroFormulario') return erro.message;
  return 'Não foi possível salvar agora. Tente de novo em instantes.';
};

/**
 * Erro de validação local (mensagem já pensada para quem edita).
 */
export class ErroFormulario extends Error {
  /** @param {string} mensagem Texto seguro. */
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroFormulario';
  }
}

/**
 * Fecha o painel aberto sem perguntar (troca de rota, fim de sessão).
 * @returns {void}
 */
export const fecharPainelAberto = () => {
  if (painelAberto && painelAberto.open) {
    painelAberto.close();
  }
};

/**
 * Abre o painel.
 * @param {OpcoesPainel} opcoes Opções.
 * @returns {Promise<boolean>} true se salvou; false se fechou sem salvar.
 */
export const abrirPainel = ({
  titulo, descricao, corpo, rotuloSalvar = 'Salvar', tamanho = 'padrao', aoSalvar,
}) => new Promise((resolve) => {
  fecharPainelAberto();
  contador += 1;
  const idTitulo = `painelTitulo${contador}`;
  let sujo = false;
  let salvando = false;
  let salvou = false;

  const erro = criarElemento('p', { classe: 'painel__erro', atributos: { role: 'alert', hidden: true } });
  const botaoSalvar = criarElemento('button', {
    classe: 'botao botao--primario',
    atributos: { type: 'submit' },
    filhos: [criarElemento('span', { classe: 'botao__rotulo', texto: rotuloSalvar })],
  });
  const formulario = criarElemento('form', {
    classe: 'painel__formulario',
    atributos: { novalidate: true },
    filhos: [corpo],
  });
  const dialogo = criarElemento('dialog', {
    classe: ['modal', 'painel', tamanho === 'largo' ? 'modal--largo' : ''],
    atributos: { 'aria-labelledby': idTitulo },
  });

  const pedirFechamento = async () => {
    if (salvando) return;
    if (sujo && !(await confirmar({
      titulo: 'Descartar as alterações?',
      texto: 'O que você mudou neste painel ainda não foi salvo.',
      rotuloConfirmar: 'Descartar',
      rotuloCancelar: 'Continuar editando',
      perigo: true,
    }))) return;
    dialogo.close();
  };

  const mostrarErro = (mensagem) => {
    erro.replaceChildren(criarIcone('erro', 'painel__erro-icone'), criarElemento('span', { texto: mensagem }));
    erro.toggleAttribute('hidden', !mensagem);
    if (mensagem) erro.scrollIntoView({ block: 'nearest' });
  };

  formulario.addEventListener('input', () => { sujo = true; });
  formulario.addEventListener('change', () => { sujo = true; });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    salvando = true;
    mostrarErro('');
    definirCarregando(botaoSalvar, true, 'Salvando…');
    try {
      await aoSalvar();
      salvou = true;
      dialogo.close();
    } catch (falha) {
      if (!(falha instanceof ErroApi) && !(falha instanceof ErroFormulario)) logErro('painel_salvar_falhou', falha);
      mostrarErro(mensagemDeErro(falha));
    } finally {
      salvando = false;
      definirCarregando(botaoSalvar, false);
    }
  });

  dialogo.append(criarElemento('div', {
    classe: 'cartao modal__cartao painel__cartao',
    filhos: [
      criarElemento('div', {
        classe: 'modal__cabecalho',
        filhos: [
          criarElemento('div', {
            filhos: [
              criarElemento('h2', { classe: 'modal__titulo', texto: titulo, atributos: { id: idTitulo } }),
              descricao ? criarElemento('p', { classe: 'modal__descricao texto-pequeno', texto: descricao }) : null,
            ],
          }),
          criarElemento('button', {
            classe: 'botao botao--fantasma botao--icone botao--sm',
            atributos: { type: 'button', 'aria-label': 'Fechar' },
            filhos: [criarIcone('fechar', 'botao__icone')],
            eventos: { click: () => { pedirFechamento(); } },
          }),
        ],
      }),
      formulario,
      erro,
      criarElemento('div', {
        classe: 'modal__acoes painel__acoes',
        filhos: [
          criarElemento('button', {
            classe: 'botao botao--secundario',
            atributos: { type: 'button' },
            filhos: [criarElemento('span', { classe: 'botao__rotulo', texto: 'Cancelar' })],
            eventos: { click: () => { pedirFechamento(); } },
          }),
          botaoSalvar,
        ],
      }),
    ],
  }));
  // O botão de enviar fica fora do <form> (rodapé fixo): liga-o pelo atributo `form`.
  const idFormulario = `painelFormulario${contador}`;
  formulario.id = idFormulario;
  botaoSalvar.setAttribute('form', idFormulario);

  dialogo.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    pedirFechamento();
  });
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) pedirFechamento();
  });
  dialogo.addEventListener('close', () => {
    dialogo.remove();
    if (painelAberto === dialogo) painelAberto = null;
    resolve(salvou);
  }, { once: true });

  document.body.append(dialogo);
  painelAberto = dialogo;
  dialogo.showModal();
  const primeiro = formulario.querySelector('input:not([type="hidden"]), textarea, select');
  if (primeiro) primeiro.focus();
});
