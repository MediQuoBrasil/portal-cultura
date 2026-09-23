/**
 * @file previa/reunioes.js
 * Reuniões individuais com a gestão de saúde: agendamento (dia, horário e pauta), validação
 * da pauta pela gestão, confirmação de presença e validação do resumo enviado por e-mail.
 * Tudo simulado em memória; nada sai do navegador.
 */

import {
  DIAS_REUNIAO, HORARIOS_REUNIAO, PAUTAS, horarioOcupado, reunioesIniciais,
} from './dados.js';
import { renderizarGradeMes } from './grade-mes.js';
import {
  criarElemento, exigirElemento, formatarData, hoje, mesmoDia, mostrarToast, somarDias,
} from './ui.js';

/** @typedef {import('./dados.js').Reuniao} Reuniao */
/** @typedef {import('./dados.js').StatusReuniao} StatusReuniao */

const JANELA_DIAS = 42;
const ATRASO_VALIDACAO_MS = 3500;

/** @type {Readonly<Object<StatusReuniao, {texto: string, selo: string}>>} */
const STATUS = Object.freeze({
  'aguardando-pauta': { texto: 'Aguardando validação da pauta', selo: 'selo--alerta' },
  'pauta-validada': { texto: 'Pauta validada', selo: '' },
  'presenca-confirmada': { texto: 'Presença confirmada', selo: 'selo--sucesso' },
  'aguardando-validacao': { texto: 'Resumo aguardando sua validação', selo: 'selo--alerta' },
  validada: { texto: 'Reunião validada', selo: 'selo--sucesso' },
  'correcao-solicitada': { texto: 'Correção solicitada', selo: 'selo--perigo' },
});

/** @type {Array<Reuniao>} */
const reunioes = reunioesIniciais();

const agenda = {
  ano: hoje().getFullYear(),
  mes: hoje().getMonth(),
  /** @type {?number} */
  dia: null,
  /** @type {?string} */
  horario: null,
  /** @type {Set<string>} */
  pautas: new Set(),
};

/** @type {?Reuniao} Reunião cujo resumo está aberto no diálogo. */
let reuniaoDoResumo = null;

/**
 * @param {Reuniao} reuniao Reunião.
 * @returns {string} "Terça-feira, 29 de setembro às 10:30".
 */
const descreverQuando = (reuniao) => `${formatarData(reuniao.data, { weekday: 'long', day: 'numeric', month: 'long' })} às ${reuniao.horario}`;

/**
 * Próxima reunião futura (para o Início).
 * @returns {?Reuniao} Reunião ou null.
 */
export const proximaReuniao = () => reunioes
  .filter((r) => r.data >= hoje() && r.status !== 'correcao-solicitada')
  .sort((a, b) => a.data - b.data)[0] || null;

/**
 * Selo de status.
 * @param {StatusReuniao} status Status.
 * @returns {HTMLElement} Selo.
 */
export const criarSeloStatus = (status) => criarElemento('span', {
  classe: ['selo', STATUS[status].selo], texto: STATUS[status].texto,
});

/**
 * @param {Date} data Dia.
 * @returns {boolean} Dia dentro da janela e com agenda.
 */
const diaDisponivel = (data) => {
  const inicio = somarDias(hoje(), 1);
  return data >= inicio
    && data <= somarDias(hoje(), JANELA_DIAS)
    && DIAS_REUNIAO.includes(data.getDay())
    && HORARIOS_REUNIAO.some((_, i) => !horarioOcupado(data, i));
};

/**
 * @param {Date} data Dia.
 * @param {string} horario HH:MM.
 * @param {number} indice Índice do horário.
 * @returns {boolean} Horário livre (sem ocupação e sem reunião sua).
 */
const horarioLivre = (data, horario, indice) => !horarioOcupado(data, indice)
  && !reunioes.some((r) => mesmoDia(r.data, data) && r.horario === horario);

/**
 * Ações de cada reunião conforme o status.
 * @param {Reuniao} reuniao Reunião.
 * @returns {Array<HTMLElement>} Botões.
 */
const criarAcoes = (reuniao) => {
  /**
   * @param {string} rotulo Rótulo.
   * @param {string} variante Variante do botão.
   * @param {function(): void} aoClicar Ação.
   * @returns {HTMLElement} Botão.
   */
  const botao = (rotulo, variante, aoClicar) => criarElemento('button', {
    classe: `botao botao--${variante} botao--sm`, texto: rotulo, atributos: { type: 'button' }, eventos: { click: aoClicar },
  });
  switch (reuniao.status) {
    case 'pauta-validada':
      return [botao('Confirmar presença', 'primario', () => {
        reuniao.status = 'presenca-confirmada';
        renderizarLista(); // eslint-disable-line no-use-before-define
        mostrarToast('Presença confirmada. O link da chamada chega por e-mail na véspera.', 'sucesso');
      })];
    case 'aguardando-pauta':
      return [botao('Cancelar solicitação', 'secundario', () => {
        reunioes.splice(reunioes.indexOf(reuniao), 1);
        renderizarTudo(); // eslint-disable-line no-use-before-define
        mostrarToast('Solicitação cancelada.');
      })];
    case 'presenca-confirmada':
      return [botao('Entrar na chamada', 'secundario', () => {
        mostrarToast('No portal final, este botão abre o link da videochamada no horário marcado.');
      })];
    case 'aguardando-validacao':
      return [botao('Ver resumo e validar', 'primario', () => abrirResumo(reuniao))]; // eslint-disable-line no-use-before-define
    default:
      return [];
  }
};

/** @returns {void} */
const renderizarLista = () => {
  const agora = hoje();
  const futuras = reunioes.filter((r) => r.data >= agora).sort((a, b) => a.data - b.data);
  const passadas = reunioes.filter((r) => r.data < agora).sort((a, b) => b.data - a.data);
  const itens = [...futuras, ...passadas].map((reuniao) => criarElemento('li', {
    classe: 'prot-reuniao',
    filhos: [
      criarElemento('div', {
        classe: 'prot-reuniao__topo',
        filhos: [
          criarElemento('span', { classe: 'prot-reuniao__quando', texto: descreverQuando(reuniao) }),
          criarSeloStatus(reuniao.status),
        ],
      }),
      criarElemento('ul', {
        classe: 'prot-reuniao__pautas',
        atributos: { 'aria-label': 'Pauta' },
        filhos: reuniao.pautas.map((p) => criarElemento('li', { classe: 'selo selo--neutro', texto: p })),
      }),
      criarElemento('div', { classe: 'prot-reuniao__acoes', filhos: criarAcoes(reuniao) }),
    ],
  }));
  exigirElemento('reuniaoLista').replaceChildren(...itens);
};

/** @returns {void} */
const renderizarHorarios = () => {
  const alvo = exigirElemento('reuniaoHorarios');
  if (agenda.dia === null) {
    alvo.replaceChildren(criarElemento('p', { classe: 'campo-ajuda', texto: 'Escolha um dia no calendário para ver os horários.' }));
    return;
  }
  const data = new Date(agenda.ano, agenda.mes, agenda.dia);
  alvo.replaceChildren(...HORARIOS_REUNIAO.map((horario, i) => {
    const livre = horarioLivre(data, horario, i);
    return criarElemento('button', {
      classe: 'prot-chip',
      texto: horario,
      atributos: {
        type: 'button',
        'aria-pressed': agenda.horario === horario ? 'true' : 'false',
        'aria-label': livre ? horario : `${horario}, indisponível`,
        disabled: !livre,
      },
      eventos: {
        click: () => {
          agenda.horario = horario;
          renderizarHorarios();
          const selecionado = alvo.querySelector('[aria-pressed="true"]');
          if (selecionado instanceof HTMLElement) selecionado.focus();
        },
      },
    });
  }));
};

/** @returns {void} */
const renderizarCalendario = () => {
  const inicio = hoje();
  const limite = somarDias(inicio, JANELA_DIAS);
  renderizarGradeMes(exigirElemento('reuniaoCalendario'), {
    ano: agenda.ano,
    mes: agenda.mes,
    selecionado: agenda.dia,
    habilitado: (dia) => diaDisponivel(new Date(agenda.ano, agenda.mes, dia)),
    marcas: (dia) => (reunioes.some((r) => mesmoDia(r.data, new Date(agenda.ano, agenda.mes, dia))) ? ['#5e6ad2'] : []),
    descricao: (dia) => {
      const data = new Date(agenda.ano, agenda.mes, dia);
      if (reunioes.some((r) => mesmoDia(r.data, data))) return 'você tem reunião';
      return diaDisponivel(data) ? 'com horários' : 'sem agenda';
    },
    aoSelecionar: (dia) => {
      agenda.dia = dia;
      agenda.horario = null;
      renderizarCalendario();
      renderizarHorarios();
    },
    aoMudarMes: (delta) => {
      const alvo = new Date(agenda.ano, agenda.mes + delta, 1);
      agenda.ano = alvo.getFullYear();
      agenda.mes = alvo.getMonth();
      agenda.dia = null;
      agenda.horario = null;
      renderizarCalendario();
      renderizarHorarios();
    },
    podeVoltar: agenda.ano > inicio.getFullYear() || agenda.mes > inicio.getMonth(),
    podeAvancar: agenda.ano < limite.getFullYear() || agenda.mes < limite.getMonth(),
  });
};

/** @returns {void} */
const renderizarTudo = () => {
  renderizarCalendario();
  renderizarHorarios();
  renderizarLista();
};

/** @returns {void} */
const renderizarPautas = () => {
  exigirElemento('reuniaoPautas').replaceChildren(...PAUTAS.map((pauta) => criarElemento('button', {
    classe: 'prot-chip',
    texto: pauta,
    atributos: { type: 'button', 'aria-pressed': agenda.pautas.has(pauta) ? 'true' : 'false' },
    eventos: {
      click: (evento) => {
        if (agenda.pautas.has(pauta)) agenda.pautas.delete(pauta);
        else agenda.pautas.add(pauta);
        /** @type {HTMLElement} */ (evento.currentTarget).setAttribute('aria-pressed', agenda.pautas.has(pauta) ? 'true' : 'false');
      },
    },
  })));
};

/**
 * Valida e registra a solicitação; a "gestão" valida a pauta após alguns segundos.
 * @param {SubmitEvent} evento Envio.
 * @returns {void}
 */
const solicitar = (evento) => {
  evento.preventDefault();
  const erro = exigirElemento('reuniaoErro');
  if (agenda.dia === null || agenda.horario === null) {
    erro.textContent = 'Escolha um dia e um horário.';
    return;
  }
  if (agenda.pautas.size === 0) {
    erro.textContent = 'Escolha pelo menos um tema para a pauta.';
    return;
  }
  erro.textContent = '';
  const detalhe = /** @type {HTMLTextAreaElement} */ (exigirElemento('reuniaoDetalhe'));
  /** @type {Reuniao} */
  const nova = {
    id: `r${Date.now()}`,
    data: new Date(agenda.ano, agenda.mes, agenda.dia),
    horario: agenda.horario,
    pautas: [...agenda.pautas],
    detalhe: detalhe.value.trim().slice(0, 500),
    status: 'aguardando-pauta',
    resumo: null,
  };
  reunioes.push(nova);
  agenda.dia = null;
  agenda.horario = null;
  agenda.pautas.clear();
  detalhe.value = '';
  renderizarPautas();
  renderizarTudo();
  mostrarToast('Reunião solicitada. A gestão de saúde vai validar a pauta.', 'sucesso');

  setTimeout(() => {
    if (!reunioes.includes(nova) || nova.status !== 'aguardando-pauta') return;
    nova.status = 'pauta-validada';
    renderizarLista();
    mostrarToast(`Pauta validada para ${descreverQuando(nova)}. Confirme sua presença.`, 'info');
  }, ATRASO_VALIDACAO_MS);
};

/**
 * @param {string} titulo Título da lista.
 * @param {Array<string>} itens Itens.
 * @returns {Array<HTMLElement>} Título + lista.
 */
const secaoEmail = (titulo, itens) => [
  criarElemento('h3', { texto: titulo }),
  criarElemento('ul', { filhos: itens.map((t) => criarElemento('li', { texto: t })) }),
];

/**
 * Abre o "e-mail" de resumo para validação.
 * @param {Reuniao} reuniao Reunião.
 * @returns {void}
 */
const abrirResumo = (reuniao) => {
  if (!reuniao.resumo) return;
  reuniaoDoResumo = reuniao;
  const data = formatarData(reuniao.data, { day: '2-digit', month: '2-digit' });
  exigirElemento('resumoCorpo').replaceChildren(
    criarElemento('div', {
      classe: 'prot-email__meta',
      filhos: [
        criarElemento('span', { filhos: ['De: ', criarElemento('strong', { texto: 'Gestão de Saúde MediQuo' })] }),
        criarElemento('span', { filhos: ['Para: ', criarElemento('strong', { texto: 'Ana Ribeiro' })] }),
        criarElemento('span', { filhos: ['Assunto: ', criarElemento('strong', { texto: `Resumo da sua reunião individual de ${data}` })] }),
      ],
    }),
    criarElemento('p', { texto: 'Olá, Ana! Obrigado pela conversa. Este é o resumo do que combinamos:' }),
    ...secaoEmail('Pontos discutidos', reuniao.resumo.pontos),
    ...secaoEmail('Encaminhamentos', reuniao.resumo.encaminhamentos),
    criarElemento('p', {
      classe: 'texto-mudo',
      texto: 'Confirme que a reunião ocorreu. Se algo não estiver correto, peça uma correção e a gestão ajusta o registro.',
    }),
  );
  const dialogo = /** @type {HTMLDialogElement} */ (exigirElemento('dialogoResumo'));
  dialogo.showModal();
};

/**
 * @param {StatusReuniao} status Novo status.
 * @param {string} mensagem Toast.
 * @returns {void}
 */
const concluirResumo = (status, mensagem) => {
  if (reuniaoDoResumo) reuniaoDoResumo.status = status;
  reuniaoDoResumo = null;
  /** @type {HTMLDialogElement} */ (exigirElemento('dialogoResumo')).close();
  renderizarLista();
  mostrarToast(mensagem, status === 'validada' ? 'sucesso' : 'info');
};

/**
 * Liga a página (uma vez).
 * @returns {void}
 */
export const iniciarReunioes = () => {
  exigirElemento('reuniaoFormulario').addEventListener('submit', solicitar);
  exigirElemento('resumoConfirmar').addEventListener('click', () => {
    concluirResumo('validada', 'Reunião validada. Obrigado!');
  });
  exigirElemento('resumoContestar').addEventListener('click', () => {
    concluirResumo('correcao-solicitada', 'Pedido de correção enviado à gestão de saúde.');
  });
  renderizarPautas();
  renderizarTudo();
};

/**
 * Re-renderiza ao entrar na página (o Início pode ter mudado o estado).
 * @returns {void}
 */
export const aoEntrarReunioes = () => renderizarLista();
