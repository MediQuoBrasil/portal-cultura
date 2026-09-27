/**
 * @file modulos/feedback/formulario.js
 * Formulário de resposta do feedback anônimo. Cada pergunta vira um `<fieldset>` com
 * legenda, controles nativos (rádio ou texto) e mensagem de erro ligada por
 * `aria-describedby`. Validação local só para retorno imediato; quem decide é o servidor
 * (Feedback.gs → validarSubmissaoFeedback).
 */

import { ErroApi } from '../../api.js';
import { logErro } from '../../log.js';
import definirCarregando from '../../ui/carregando.js';
import { criarElemento } from '../../ui/dom.js';
import { criarIcone } from '../../ui/icones.js';
import { confirmar } from '../../ui/modal.js';
import { enviarRespostas, rascunhos, rotuloCiclo } from './dados.js';

/** @typedef {import('./dados.js').Pergunta} Pergunta */
/** @typedef {import('./dados.js').StatusFeedback} StatusFeedback */

/**
 * @typedef {Object} ControlePergunta
 * @property {HTMLElement} elemento Fieldset pronto.
 * @property {function(): string} valor Valor atual ('' = sem resposta).
 * @property {function(string): void} definirErro Mostra/limpa o erro.
 * @property {function(): void} focar Foca o primeiro controle.
 */

let sequencia = 0;

/**
 * @param {string} base Prefixo.
 * @returns {string} ID único.
 */
const novoId = (base) => {
  sequencia += 1;
  return `${base}-${sequencia}`;
};

/**
 * Rótulos das pontas de cada escala (o número sozinho não diz o sentido).
 * @type {Readonly<Object<string, {min: string, max: string}>>}
 */
const PONTAS = Object.freeze({
  escala_1_5: { min: '1 = muito pouco', max: '5 = muito' },
  nps_0_10: { min: '0 = nada provável', max: '10 = muito provável' },
});

/**
 * Escala numérica em rádios (1–5 ou 0–10), com as pontas explicadas.
 * @param {Pergunta} pergunta Pergunta.
 * @param {string} nome Nome do grupo de rádios.
 * @param {string} valor Valor do rascunho.
 * @returns {{controles: HTMLElement, valor: function(): string}} Controles.
 */
const criarEscala = (pergunta, nome, valor) => {
  const [min, max] = pergunta.tipo === 'nps_0_10' ? [0, 10] : [1, 5];
  const pontas = PONTAS[pergunta.tipo];
  const itens = [];
  for (let n = min; n <= max; n += 1) {
    const id = novoId(`${nome}-${n}`);
    itens.push(criarElemento('label', {
      classe: 'escala__item',
      atributos: { for: id },
      filhos: [
        criarElemento('input', {
          classe: 'escala__entrada',
          atributos: {
            type: 'radio', id, name: nome, value: String(n), checked: valor === String(n),
          },
        }),
        criarElemento('span', { classe: 'escala__numero', texto: String(n) }),
      ],
    }));
  }
  const controles = criarElemento('div', {
    classe: 'escala-grupo',
    filhos: [
      criarElemento('div', { classe: ['escala', `escala--${max - min + 1}`], filhos: itens }),
      criarElemento('div', {
        classe: 'escala__pontas texto-pequeno texto-mudo',
        atributos: { 'aria-hidden': 'true' },
        filhos: [criarElemento('span', { texto: pontas.min }), criarElemento('span', { texto: pontas.max })],
      }),
    ],
  });
  return {
    controles,
    valor: () => {
      const marcado = controles.querySelector('input:checked');
      return marcado ? marcado.value : '';
    },
  };
};

/**
 * Múltipla escolha (uma opção).
 * @param {Pergunta} pergunta Pergunta.
 * @param {string} nome Nome do grupo.
 * @param {string} valor Valor do rascunho.
 * @returns {{controles: HTMLElement, valor: function(): string}} Controles.
 */
const criarMultipla = (pergunta, nome, valor) => {
  const controles = criarElemento('div', {
    classe: 'escolhas__itens',
    filhos: pergunta.opcoes.map((opcao) => {
      const id = novoId(`${nome}-op`);
      return criarElemento('label', {
        classe: 'escolha',
        atributos: { for: id },
        filhos: [
          criarElemento('input', {
            classe: 'escolha__entrada',
            atributos: {
              type: 'radio', id, name: nome, value: opcao, checked: valor === opcao,
            },
          }),
          criarElemento('span', { classe: 'escolha__rotulo', texto: opcao }),
        ],
      });
    }),
  });
  return {
    controles,
    valor: () => {
      const marcado = controles.querySelector('input:checked');
      return marcado ? marcado.value : '';
    },
  };
};

/**
 * Texto livre com contador de caracteres.
 * @param {string} id ID do textarea.
 * @param {string} valor Valor do rascunho.
 * @param {number} max Máximo de caracteres.
 * @param {string} idContador ID do contador (descrição acessível).
 * @returns {{controles: HTMLElement, valor: function(): string, entrada: HTMLTextAreaElement}} Controles.
 */
const criarTexto = (id, valor, max, idContador) => {
  const entrada = criarElemento('textarea', {
    classe: 'campo',
    atributos: {
      id, rows: '4', maxlength: String(max), autocomplete: 'off',
    },
  });
  entrada.value = valor.slice(0, max);
  const contador = criarElemento('p', {
    classe: 'campo-ajuda feedback-contador',
    atributos: { id: idContador, 'aria-live': 'off' },
  });
  const atualizar = () => {
    contador.textContent = `${entrada.value.length} de ${max} caracteres`;
  };
  entrada.addEventListener('input', atualizar);
  atualizar();
  return {
    controles: criarElemento('div', { classe: 'feedback-texto', filhos: [entrada, contador] }),
    valor: () => entrada.value.trim(),
    entrada,
  };
};

/**
 * Monta o fieldset de uma pergunta.
 * @param {Pergunta} pergunta Pergunta.
 * @param {number} indice Posição (1-based) para a numeração.
 * @param {string} rascunho Valor salvo em memória.
 * @param {number} textoMax Máximo de caracteres de texto livre.
 * @returns {ControlePergunta} Controle.
 */
const criarPergunta = (pergunta, indice, rascunho, textoMax) => {
  const base = novoId(`pergunta-${pergunta.id}`);
  const idLegenda = `${base}-legenda`;
  const idErro = `${base}-erro`;
  const idContador = `${base}-contador`;
  const erro = criarElemento('p', { classe: 'campo-erro', atributos: { id: idErro, 'aria-live': 'polite' } });
  const legenda = criarElemento('legend', {
    classe: 'feedback-pergunta__legenda',
    atributos: { id: idLegenda },
    filhos: [
      criarElemento('span', { classe: 'feedback-pergunta__numero', texto: String(indice).padStart(2, '0') }),
      criarElemento('span', { texto: pergunta.texto }),
      criarElemento('span', {
        classe: 'feedback-pergunta__marca',
        texto: pergunta.obrigatoria ? ' (obrigatória)' : ' (opcional)',
      }),
    ],
  });

  let corpo;
  if (pergunta.tipo === 'texto') {
    const idTexto = `${base}-texto`;
    corpo = criarTexto(idTexto, rascunho, textoMax, idContador);
    corpo.entrada.setAttribute('aria-labelledby', idLegenda);
    corpo.entrada.setAttribute('aria-describedby', `${idContador} ${idErro}`);
  } else if (pergunta.tipo === 'multipla') {
    corpo = criarMultipla(pergunta, base, rascunho);
  } else {
    corpo = criarEscala(pergunta, base, rascunho);
  }

  const elemento = criarElemento('fieldset', {
    classe: 'cartao feedback-pergunta',
    atributos: {
      'data-pergunta': pergunta.id,
      'aria-describedby': pergunta.tipo === 'texto' ? undefined : idErro,
      'aria-required': pergunta.obrigatoria ? 'true' : undefined,
    },
    filhos: [legenda, corpo.controles, erro],
  });
  return {
    elemento,
    valor: corpo.valor,
    definirErro: (mensagem) => {
      erro.textContent = mensagem;
      elemento.classList.toggle('feedback-pergunta--erro', Boolean(mensagem));
    },
    focar: () => {
      const alvo = elemento.querySelector('input:checked') || elemento.querySelector('input, textarea');
      if (alvo) alvo.focus();
    },
  };
};

/**
 * @param {StatusFeedback} status Status.
 * @returns {HTMLElement} Aviso sobre como o anonimato funciona (texto honesto e curto).
 */
const criarAvisoAnonimato = (status) => criarElemento('aside', {
  classe: 'cartao feedback-aviso',
  atributos: { 'aria-labelledby': 'feedbackAvisoTitulo' },
  filhos: [
    criarElemento('span', { classe: 'icone-caixa', filhos: [criarIcone('escudo')] }),
    criarElemento('div', {
      classe: 'feedback-aviso__textos',
      filhos: [
        criarElemento('p', {
          classe: 'feedback-aviso__titulo', texto: 'Suas respostas são anônimas', atributos: { id: 'feedbackAvisoTitulo' },
        }),
        criarElemento('p', {
          classe: 'texto-pequeno texto-mudo',
          texto: 'O portal registra só que você participou deste ciclo, separado do que você respondeu. '
            + 'As respostas entram na planilha em lotes embaralhados e os resultados só aparecem '
            + `com pelo menos ${status.kMinimo} respostas. `
            + 'Nos campos de texto, evite nomes, datas ou detalhes que possam identificar você.',
        }),
      ],
    }),
  ],
});

/**
 * @typedef {Object} OpcoesFormulario
 * @property {StatusFeedback} status Status do ciclo (habilitado).
 * @property {function(): void} aoEnviar Chamado depois que o servidor confirmou o envio.
 * @property {function(ErroApi): void} aoConflito Ciclo mudou ou já respondeu: recarregar.
 */

/**
 * Cria o formulário de resposta.
 * @param {OpcoesFormulario} opcoes Opções.
 * @returns {HTMLElement} Seção do formulário.
 */
const criarFormulario = ({ status, aoEnviar, aoConflito }) => {
  const rascunho = rascunhos.get(status.ciclo) || {};
  const perguntas = status.perguntas.map((p, i) => ({
    pergunta: p,
    controle: criarPergunta(p, i + 1, typeof rascunho[p.id] === 'string' ? rascunho[p.id] : '', status.textoMax),
  }));

  const lerRespostas = () => Object.fromEntries(perguntas
    .map(({ pergunta, controle }) => [pergunta.id, controle.valor()])
    .filter(([, valor]) => valor !== ''));

  const erroGeral = criarElemento('p', { classe: 'painel__erro', atributos: { role: 'alert', hidden: true } });
  const mostrarErroGeral = (mensagem) => {
    erroGeral.replaceChildren(criarIcone('erro', 'painel__erro-icone'), criarElemento('span', { texto: mensagem }));
    erroGeral.toggleAttribute('hidden', !mensagem);
  };

  const botao = criarElemento('button', {
    classe: 'botao botao--primario',
    atributos: { type: 'submit' },
    filhos: [criarElemento('span', { classe: 'botao__rotulo', texto: 'Enviar respostas' })],
  });

  const formulario = criarElemento('form', {
    classe: 'feedback-formulario',
    atributos: { novalidate: true, 'aria-labelledby': 'feedbackFormTitulo' },
    filhos: [
      criarElemento('div', {
        classe: 'feedback-formulario__cabecalho',
        filhos: [
          criarElemento('h2', {
            classe: 'titulo-3', texto: `Feedback de ${rotuloCiclo(status.ciclo)}`, atributos: { id: 'feedbackFormTitulo' },
          }),
          criarElemento('p', {
            classe: 'texto-mudo texto-pequeno',
            texto: `${perguntas.length} ${perguntas.length === 1 ? 'pergunta' : 'perguntas'}. `
              + 'Leva poucos minutos. Depois de enviar, não dá para alterar.',
          }),
        ],
      }),
      criarAvisoAnonimato(status),
      ...perguntas.map(({ controle }) => controle.elemento),
      erroGeral,
      criarElemento('div', { classe: 'feedback-formulario__acoes', filhos: [botao] }),
    ],
  });

  // Rascunho só em memória: sair e voltar para a página não perde o que foi marcado.
  formulario.addEventListener('input', () => { rascunhos.set(status.ciclo, lerRespostas()); });
  formulario.addEventListener('change', () => { rascunhos.set(status.ciclo, lerRespostas()); });

  const validar = () => {
    let primeiro = null;
    perguntas.forEach(({ pergunta, controle }) => {
      const faltando = pergunta.obrigatoria && controle.valor() === '';
      controle.definirErro(faltando ? 'Responda esta pergunta para enviar.' : '');
      if (faltando && !primeiro) primeiro = controle;
    });
    const respostas = lerRespostas();
    if (primeiro) {
      primeiro.focar();
      return null;
    }
    if (Object.keys(respostas).length === 0) {
      mostrarErroGeral('Responda pelo menos uma pergunta antes de enviar.');
      perguntas[0].controle.focar();
      return null;
    }
    return respostas;
  };

  let enviando = false;
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviando) return;
    mostrarErroGeral('');
    const respostas = validar();
    if (!respostas) return;
    const ok = await confirmar({
      titulo: 'Enviar suas respostas?',
      texto: 'Depois de enviar, não é possível alterar nem apagar as respostas deste ciclo.',
      rotuloConfirmar: 'Enviar respostas',
      rotuloCancelar: 'Revisar',
    });
    if (!ok) return;
    enviando = true;
    definirCarregando(botao, true, 'Enviando…');
    try {
      await enviarRespostas(status.ciclo, respostas);
      rascunhos.delete(status.ciclo);
      aoEnviar();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'CONFLITO') {
        aoConflito(erro);
        return;
      }
      if (!(erro instanceof ErroApi)) logErro('feedback_envio_falhou', erro);
      const mensagem = erro instanceof ErroApi
        ? erro.message
        : 'Não foi possível enviar agora. Suas respostas continuam aqui; tente de novo em instantes.';
      mostrarErroGeral(erro instanceof ErroApi && ['TEMPO_ESGOTADO', 'REDE'].includes(erro.codigo)
        ? `${mensagem} Se a conexão caiu durante o envio, recarregue a página antes de tentar de novo: `
          + 'o portal mostra se a resposta já foi registrada.'
        : mensagem);
    } finally {
      enviando = false;
      definirCarregando(botao, false);
    }
  });

  return formulario;
};

export default criarFormulario;
