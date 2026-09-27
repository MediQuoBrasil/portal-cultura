/**
 * @file editor/campos.js
 * Controles de formulário do editor, acessíveis e no padrão visual (`.campo-grupo`,
 * `.campo-rotulo`, `.campo`, `.campo-ajuda`): rótulo ligado ao campo, ajuda e erro ligados
 * por `aria-describedby`, obrigatório anunciado. Tudo por DOM seguro.
 */

import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';

let sequencia = 0;

/**
 * @param {string} base Prefixo.
 * @returns {string} ID único no documento.
 */
const novoId = (base) => {
  sequencia += 1;
  return `${base}-${sequencia}`;
};

/**
 * @typedef {Object} Campo
 * @property {HTMLElement} elemento Grupo pronto para inserir.
 * @property {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} entrada Controle.
 * @property {function(string): void} definirErro Mostra/limpa a mensagem de erro do campo.
 * @property {HTMLElement} status Área para retorno imediato (ex.: mídia reconhecida).
 */

/**
 * @typedef {Object} OpcoesCampoTexto
 * @property {string} nome Nome do campo (atributo `name`).
 * @property {string} rotulo Rótulo visível.
 * @property {string} [valor='']
 * @property {string} [ajuda]
 * @property {string} [placeholder]
 * @property {boolean} [obrigatorio=false]
 * @property {number} [max] `maxlength`.
 * @property {'linha'|'texto-longo'|'data'} [controle='linha']
 * @property {number} [linhas=6] Linhas do texto longo.
 */

/**
 * Campo de texto (linha, texto longo ou data).
 * @param {OpcoesCampoTexto} opcoes Opções.
 * @returns {Campo} Campo.
 */
export const criarCampoTexto = ({
  nome, rotulo, valor = '', ajuda, placeholder, obrigatorio = false, max, controle = 'linha', linhas = 6,
}) => {
  const id = novoId(`campo-${nome}`);
  const idAjuda = ajuda ? `${id}-ajuda` : null;
  const idErro = `${id}-erro`;
  const idStatus = `${id}-status`;
  const atributos = {
    id,
    name: nome,
    required: obrigatorio,
    maxlength: max ? String(max) : undefined,
    placeholder,
    'aria-describedby': [idAjuda, idStatus, idErro].filter(Boolean).join(' '),
    autocomplete: 'off',
  };
  let entrada;
  if (controle === 'texto-longo') {
    entrada = criarElemento('textarea', { classe: 'campo', atributos: { ...atributos, rows: String(linhas) } });
  } else {
    entrada = criarElemento('input', {
      classe: 'campo',
      atributos: { ...atributos, type: controle === 'data' ? 'date' : 'text', spellcheck: nome === 'midia' || nome === 'link' ? 'false' : undefined },
    });
  }
  entrada.value = valor;
  const erro = criarElemento('p', { classe: 'campo-erro', atributos: { id: idErro, 'aria-live': 'polite' } });
  const status = criarElemento('p', { classe: 'campo-status', atributos: { id: idStatus, 'aria-live': 'polite' } });
  const elemento = criarElemento('div', {
    classe: 'campo-grupo',
    filhos: [
      criarElemento('label', {
        classe: 'campo-rotulo',
        atributos: { for: id },
        filhos: [rotulo, obrigatorio ? criarElemento('span', { classe: 'campo-obrigatorio', texto: ' (obrigatório)' }) : null],
      }),
      entrada,
      ajuda ? criarElemento('p', { classe: 'campo-ajuda', texto: ajuda, atributos: { id: idAjuda } }) : null,
      status,
      erro,
    ],
  });
  const definirErro = (mensagem) => {
    erro.replaceChildren(mensagem || '');
    entrada.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
  };
  return {
    elemento, entrada, definirErro, status,
  };
};

/**
 * @typedef {Object} OpcaoEscolha
 * @property {string} valor
 * @property {string} rotulo
 * @property {string} [icone]
 */

/**
 * Grupo de rádios (escolha única) com legenda — usado para tipo, público e ícone.
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.nome Nome do grupo.
 * @param {string} opcoes.legenda Legenda.
 * @param {Array<OpcaoEscolha>} opcoes.itens Opções.
 * @param {string} opcoes.valor Valor marcado.
 * @param {string} [opcoes.ajuda] Ajuda.
 * @param {'lista'|'icones'} [opcoes.estilo='lista'] Aparência.
 * @returns {{elemento: HTMLElement, valor: function(): string}} Grupo.
 */
export const criarGrupoRadio = ({
  nome, legenda, itens, valor, ajuda, estilo = 'lista',
}) => {
  const idGrupo = novoId(`grupo-${nome}`);
  const elemento = criarElemento('fieldset', {
    classe: ['campo-grupo', 'escolhas', `escolhas--${estilo}`],
    atributos: { 'aria-describedby': ajuda ? `${idGrupo}-ajuda` : undefined },
    filhos: [
      criarElemento('legend', { classe: 'campo-rotulo', texto: legenda }),
      criarElemento('div', {
        classe: 'escolhas__itens',
        filhos: itens.map((item) => {
          const id = novoId(`${nome}-${item.valor}`);
          const entrada = criarElemento('input', {
            classe: 'escolha__entrada',
            atributos: {
              type: 'radio', id, name: `${idGrupo}`, value: item.valor, checked: item.valor === valor,
            },
          });
          return criarElemento('label', {
            classe: 'escolha',
            atributos: { for: id, title: estilo === 'icones' ? item.rotulo : undefined },
            filhos: [
              entrada,
              item.icone ? criarIcone(item.icone, 'escolha__icone') : null,
              criarElemento('span', { classe: estilo === 'icones' ? 'sr-only' : 'escolha__rotulo', texto: item.rotulo }),
            ],
          });
        }),
      }),
      ajuda ? criarElemento('p', { classe: 'campo-ajuda', texto: ajuda, atributos: { id: `${idGrupo}-ajuda` } }) : null,
    ],
  });
  return {
    elemento,
    valor: () => {
      const marcado = elemento.querySelector('input:checked');
      return marcado ? marcado.value : '';
    },
  };
};

/**
 * Grupo de caixas de seleção (escolha múltipla).
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.nome Nome.
 * @param {string} opcoes.legenda Legenda.
 * @param {Array<OpcaoEscolha>} opcoes.itens Itens.
 * @param {Array<string>} opcoes.marcados Valores marcados.
 * @param {string} [opcoes.ajuda] Ajuda.
 * @returns {{elemento: HTMLElement, valores: function(): Array<string>}} Grupo.
 */
export const criarGrupoCaixas = ({
  nome, legenda, itens, marcados, ajuda,
}) => {
  const idGrupo = novoId(`grupo-${nome}`);
  const elemento = criarElemento('fieldset', {
    classe: 'campo-grupo escolhas escolhas--grade',
    atributos: { 'aria-describedby': ajuda ? `${idGrupo}-ajuda` : undefined },
    filhos: [
      criarElemento('legend', { classe: 'campo-rotulo', texto: legenda }),
      criarElemento('div', {
        classe: 'escolhas__itens',
        filhos: itens.map((item) => {
          const id = novoId(`${nome}-${item.valor}`);
          return criarElemento('label', {
            classe: 'escolha',
            atributos: { for: id },
            filhos: [
              criarElemento('input', {
                classe: 'escolha__entrada',
                atributos: {
                  type: 'checkbox', id, value: item.valor, checked: marcados.includes(item.valor),
                },
              }),
              criarElemento('span', { classe: 'escolha__rotulo', texto: item.rotulo }),
            ],
          });
        }),
      }),
      ajuda ? criarElemento('p', { classe: 'campo-ajuda', texto: ajuda, atributos: { id: `${idGrupo}-ajuda` } }) : null,
    ],
  });
  return {
    elemento,
    valores: () => Array.from(elemento.querySelectorAll('input:checked'), (e) => e.value),
  };
};

/**
 * Interruptor (checkbox com papel de switch).
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.rotulo Rótulo.
 * @param {boolean} opcoes.marcado Estado.
 * @param {string} [opcoes.ajuda] Ajuda.
 * @returns {{elemento: HTMLElement, marcado: function(): boolean}} Controle.
 */
export const criarInterruptor = ({ rotulo, marcado, ajuda }) => {
  const id = novoId('interruptor');
  const entrada = criarElemento('input', {
    classe: 'interruptor__entrada',
    atributos: {
      type: 'checkbox', role: 'switch', id, checked: marcado, 'aria-describedby': ajuda ? `${id}-ajuda` : undefined,
    },
  });
  const elemento = criarElemento('div', {
    classe: 'campo-grupo',
    filhos: [
      criarElemento('label', {
        classe: 'interruptor',
        atributos: { for: id },
        filhos: [entrada, criarElemento('span', { classe: 'interruptor__trilho', atributos: { 'aria-hidden': 'true' } }), criarElemento('span', { texto: rotulo })],
      }),
      ajuda ? criarElemento('p', { classe: 'campo-ajuda', texto: ajuda, atributos: { id: `${id}-ajuda` } }) : null,
    ],
  });
  return { elemento, marcado: () => entrada.checked };
};

/**
 * Lista de seleção (`<select>`).
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.nome Nome.
 * @param {string} opcoes.rotulo Rótulo.
 * @param {Array<OpcaoEscolha>} opcoes.itens Itens.
 * @param {string} opcoes.valor Selecionado.
 * @param {string} [opcoes.ajuda] Ajuda.
 * @returns {{elemento: HTMLElement, entrada: HTMLSelectElement}} Controle.
 */
export const criarSelecao = ({
  nome, rotulo, itens, valor, ajuda,
}) => {
  const id = novoId(`selecao-${nome}`);
  const entrada = criarElemento('select', {
    classe: 'campo',
    atributos: { id, name: nome, 'aria-describedby': ajuda ? `${id}-ajuda` : undefined },
    filhos: itens.map((item) => criarElemento('option', {
      texto: item.rotulo,
      atributos: { value: item.valor, selected: item.valor === valor },
    })),
  });
  const elemento = criarElemento('div', {
    classe: 'campo-grupo',
    filhos: [
      criarElemento('label', { classe: 'campo-rotulo', texto: rotulo, atributos: { for: id } }),
      entrada,
      ajuda ? criarElemento('p', { classe: 'campo-ajuda', texto: ajuda, atributos: { id: `${id}-ajuda` } }) : null,
    ],
  });
  return { elemento, entrada };
};
