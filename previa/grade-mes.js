/**
 * @file previa/grade-mes.js
 * Calendário mensal reutilizável (celebrações e reuniões). Sem estado próprio: quem chama
 * guarda ano/mês/dia e re-renderiza. Cada dia é um <button> com aria-pressed.
 */

import {
  criarElemento, criarIcone, formatarData, mesmoDia, hoje,
} from './ui.js';

const DIAS_SEMANA = Object.freeze(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);

/**
 * @typedef {Object} OpcoesGradeMes
 * @property {number} ano Ano exibido.
 * @property {number} mes Mês exibido (0–11).
 * @property {?number} selecionado Dia selecionado (ou null).
 * @property {function(number): Array<string>} [marcas] Cores dos marcadores do dia (máx. 3 exibidas).
 * @property {function(number): boolean} [habilitado] Se o dia pode ser escolhido (padrão: sempre).
 * @property {function(number): string} [descricao] Complemento do rótulo acessível do dia.
 * @property {function(number): void} aoSelecionar Clique em um dia.
 * @property {function(number): void} aoMudarMes Navegação (-1 ou +1).
 * @property {boolean} [podeVoltar=true] Habilita o botão de mês anterior.
 * @property {boolean} [podeAvancar=true] Habilita o botão de próximo mês.
 */

/**
 * @param {string} rotulo Rótulo acessível.
 * @param {string} icone Ícone.
 * @param {boolean} habilitado Habilitado.
 * @param {function(): void} aoClicar Ação.
 * @returns {HTMLElement} Botão.
 */
const criarBotaoNavegacao = (rotulo, icone, habilitado, aoClicar) => criarElemento('button', {
  classe: 'botao botao--fantasma botao--icone botao--sm',
  atributos: { type: 'button', 'aria-label': rotulo, disabled: !habilitado },
  filhos: [criarIcone(icone, 'botao__icone')],
  eventos: { click: aoClicar },
});

/**
 * @param {Array<string>} cores Cores.
 * @returns {HTMLElement} Linha de marcadores.
 */
const criarMarcas = (cores) => criarElemento('span', {
  classe: 'cal__marcas',
  atributos: { 'aria-hidden': 'true' },
  filhos: cores.slice(0, 3).map((cor) => {
    const marca = criarElemento('span', { classe: 'cal__marca' });
    marca.style.setProperty('--cor-area', cor);
    return marca;
  }),
});

/**
 * Renderiza o mês dentro do alvo (substitui o conteúdo).
 * @param {HTMLElement} alvo Contêiner.
 * @param {OpcoesGradeMes} opcoes Opções.
 * @returns {void}
 */
export const renderizarGradeMes = (alvo, opcoes) => {
  const {
    ano, mes, selecionado, aoSelecionar, aoMudarMes,
    marcas = () => [], habilitado = () => true, descricao = () => '',
    podeVoltar = true, podeAvancar = true,
  } = opcoes;
  const primeiro = new Date(ano, mes, 1);
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const hojeData = hoje();
  const titulo = formatarData(primeiro, { month: 'long', year: 'numeric' });

  const cabecalho = criarElemento('div', {
    classe: 'cal__cabecalho',
    filhos: [
      criarElemento('p', { classe: 'cal__titulo', texto: titulo, atributos: { 'aria-live': 'polite' } }),
      criarElemento('div', {
        classe: 'cal__navegacao',
        filhos: [
          criarBotaoNavegacao('Mês anterior', 'chevron-esquerda', podeVoltar, () => aoMudarMes(-1)),
          criarBotaoNavegacao('Próximo mês', 'chevron-direita', podeAvancar, () => aoMudarMes(1)),
        ],
      }),
    ],
  });

  const celulas = DIAS_SEMANA.map((nome) => criarElemento('span', {
    classe: 'cal__semana', texto: nome, atributos: { 'aria-hidden': 'true' },
  }));
  for (let i = 0; i < primeiro.getDay(); i += 1) {
    celulas.push(criarElemento('span', { classe: 'cal__vazio', atributos: { 'aria-hidden': 'true' } }));
  }

  for (let dia = 1; dia <= totalDias; dia += 1) {
    const data = new Date(ano, mes, dia);
    const cores = marcas(dia);
    const extra = descricao(dia);
    const ehHoje = mesmoDia(data, hojeData);
    const rotulo = [formatarData(data, { day: 'numeric', month: 'long' }), ehHoje ? 'hoje' : '', extra]
      .filter(Boolean).join(', ');
    celulas.push(criarElemento('button', {
      classe: ['cal__dia', ehHoje ? 'cal__dia--hoje' : '', cores.length ? 'cal__dia--destaque' : ''],
      atributos: {
        type: 'button',
        'aria-label': rotulo,
        'aria-pressed': selecionado === dia ? 'true' : 'false',
        disabled: !habilitado(dia),
      },
      filhos: [
        criarElemento('span', { texto: String(dia) }),
        cores.length ? criarMarcas(cores) : null,
      ],
      eventos: { click: () => aoSelecionar(dia) },
    }));
  }

  // Re-render troca os botões: devolve o foco ao equivalente (mesmo rótulo) para o teclado não se perder.
  const ativo = document.activeElement;
  const rotuloFocado = ativo instanceof HTMLElement && alvo.contains(ativo) ? ativo.getAttribute('aria-label') : null;

  alvo.replaceChildren(criarElemento('div', {
    classe: 'cal',
    filhos: [cabecalho, criarElemento('div', { classe: 'cal__grade', filhos: celulas })],
  }));

  if (rotuloFocado) {
    const equivalente = Array.from(alvo.querySelectorAll('button'))
      .find((botao) => botao.getAttribute('aria-label') === rotuloFocado && !botao.disabled);
    if (equivalente) equivalente.focus();
  }
};
