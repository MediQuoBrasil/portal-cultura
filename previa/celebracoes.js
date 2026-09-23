/**
 * @file previa/celebracoes.js
 * Aniversários e entradas na empresa: calendário mensal + lista agrupada por área,
 * com filtro por área. Também expõe as celebrações dos próximos dias para o Início.
 */

import {
  AREAS, AREA_POR_ID, PROFISSIONAIS,
} from './dados.js';
import { renderizarGradeMes } from './grade-mes.js';
import {
  criarAvatar, criarElemento, criarIcone, exigirElemento, formatarData, hoje, mesmoDia, nomeMes, somarDias,
} from './ui.js';

/** @typedef {import('./dados.js').Profissional} Profissional */
/** @typedef {'aniversarios'|'entradas'} ModoCelebracao */

/**
 * @typedef {Object} Celebracao
 * @property {Profissional} pessoa Profissional.
 * @property {Date} data Data da celebração no ano exibido.
 * @property {ModoCelebracao} modo Tipo.
 * @property {number} anos Anos de casa (0 = chegou neste ano; ignorado em aniversários).
 */

const estado = {
  /** @type {ModoCelebracao} */
  modo: 'aniversarios',
  area: 'todas',
  ano: hoje().getFullYear(),
  mes: hoje().getMonth(),
  /** @type {?number} */
  dia: null,
};

/**
 * @param {number} anos Anos.
 * @returns {string} "1 ano de casa" / "3 anos de casa" / "Chegou este ano".
 */
export const textoTempoDeCasa = (anos) => {
  if (anos <= 0) return 'Chegou este ano';
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} de casa`;
};

/**
 * Celebrações de um mês.
 * @param {ModoCelebracao} modo Tipo.
 * @param {number} ano Ano.
 * @param {number} mes Mês (0–11).
 * @param {string} area 'todas' ou ID da área.
 * @returns {Array<Celebracao>} Ordenadas por dia e nome.
 */
const celebracoesDoMes = (modo, ano, mes, area) => PROFISSIONAIS
  .filter((p) => area === 'todas' || p.area === area)
  .map((pessoa) => {
    if (modo === 'aniversarios') {
      if (pessoa.aniversario.mes !== mes) return null;
      return {
        pessoa, data: new Date(ano, mes, pessoa.aniversario.dia), modo, anos: 0,
      };
    }
    const anos = ano - pessoa.entrada.getFullYear();
    if (pessoa.entrada.getMonth() !== mes || anos < 0) return null;
    return {
      pessoa, data: new Date(ano, mes, pessoa.entrada.getDate()), modo, anos,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.data - b.data || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));

/**
 * Celebrações (aniversário e tempo de casa) de hoje até `dias` à frente, para o Início.
 * @param {number} dias Janela em dias.
 * @returns {Array<Celebracao>} Ordenadas por data.
 */
export const celebracoesProximas = (dias) => {
  const inicio = hoje();
  const fim = somarDias(inicio, dias);
  const meses = new Set([[inicio.getFullYear(), inicio.getMonth()], [fim.getFullYear(), fim.getMonth()]]
    .map(([a, m]) => `${a}-${m}`));
  /** @type {Array<Celebracao>} */
  const todas = [];
  meses.forEach((chave) => {
    const [ano, mes] = chave.split('-').map(Number);
    ['aniversarios', 'entradas'].forEach((modo) => {
      todas.push(...celebracoesDoMes(/** @type {ModoCelebracao} */ (modo), ano, mes, 'todas'));
    });
  });
  return todas
    .filter((c) => c.data >= inicio && c.data <= fim && !(c.modo === 'entradas' && c.anos === 0))
    .sort((a, b) => a.data - b.data);
};

/**
 * Linha de pessoa (usada aqui e no Início).
 * @param {Celebracao} celebracao Celebração.
 * @param {{comAcao?: boolean, comArea?: boolean}} [opcoes] Opções (sem área quando a lista já agrupa por área).
 * @returns {HTMLElement} <li>.
 */
export const criarLinhaCelebracao = (celebracao, { comAcao = true, comArea = true } = {}) => {
  const { pessoa, data, modo, anos } = celebracao;
  const area = AREA_POR_ID[pessoa.area];
  const ehHoje = mesmoDia(data, hoje());
  const quando = formatarData(data, { day: '2-digit', month: 'short' }).replace('.', '');
  let detalhe = textoTempoDeCasa(anos).toLowerCase();
  if (modo === 'aniversarios') detalhe = 'aniversário';
  if (modo === 'entradas' && anos === 0) detalhe = 'chegou';

  const linha = criarElemento('li', {
    classe: 'prot-pessoa',
    filhos: [
      criarAvatar(pessoa.nome, area.cor),
      criarElemento('span', {
        classe: 'prot-pessoa__textos',
        filhos: [
          criarElemento('span', { classe: 'prot-pessoa__nome', texto: pessoa.nome }),
          criarElemento('span', {
            classe: 'prot-pessoa__detalhe',
            texto: comArea ? `${area.nome}, ${detalhe} em ${quando}` : `${detalhe.charAt(0).toUpperCase()}${detalhe.slice(1)} em ${quando}`,
          }),
        ],
      }),
      criarElemento('span', {
        classe: 'prot-pessoa__acoes',
        filhos: [
          ehHoje ? criarElemento('span', { classe: 'selo selo--sucesso', texto: 'Hoje' }) : null,
          comAcao && !(modo === 'entradas' && anos === 0) ? criarElemento('a', {
            classe: 'botao botao--fantasma botao--icone botao--sm',
            atributos: {
              href: `#/artes?pessoa=${pessoa.id}&modelo=${modo === 'aniversarios' ? 'aniversario' : `casa-${anos}`}`,
              'aria-label': `Ver arte de ${pessoa.nome}`,
              title: 'Ver arte',
            },
            filhos: [criarIcone('brilho', 'botao__icone')],
          }) : null,
        ],
      }),
    ],
  });
  linha.style.setProperty('--cor-area', area.cor);
  return linha;
};

/**
 * @param {Array<Celebracao>} lista Celebrações.
 * @returns {Map<number, Array<Celebracao>>} Por dia do mês.
 */
const agruparPorDia = (lista) => lista.reduce((mapa, c) => {
  const dia = c.data.getDate();
  mapa.set(dia, [...(mapa.get(dia) || []), c]);
  return mapa;
}, new Map());

/**
 * @param {Array<Celebracao>} lista Celebrações já filtradas.
 * @returns {HTMLElement} Grupos por área (ou vazio orientativo).
 */
const criarGrupos = (lista) => {
  if (lista.length === 0) {
    const tipo = estado.modo === 'aniversarios' ? 'aniversários' : 'entradas na empresa';
    return criarElemento('p', {
      classe: 'prot-vazio',
      texto: `Nenhum registro de ${tipo} neste período. Troque a área ou navegue para outro mês.`,
    });
  }
  const grupos = AREAS
    .map((area) => ({ area, itens: lista.filter((c) => c.pessoa.area === area.id) }))
    .filter((g) => g.itens.length > 0)
    .map(({ area, itens }) => {
      const ponto = criarElemento('span', { classe: 'prot-ponto', atributos: { 'aria-hidden': 'true' } });
      ponto.style.setProperty('--cor-area', area.cor);
      return criarElemento('section', {
        classe: 'prot-grupo-area',
        filhos: [
          criarElemento('h3', { classe: 'prot-grupo-area__titulo', filhos: [ponto, `${area.nome} (${itens.length})`] }),
          criarElemento('ul', { classe: 'prot-lista-pessoas', filhos: itens.map((c) => criarLinhaCelebracao(c, { comArea: false })) }),
        ],
      });
    });
  return criarElemento('div', { classe: 'prot-grupos-area', filhos: grupos });
};

/** @returns {void} */
const renderizar = () => {
  const doMes = celebracoesDoMes(estado.modo, estado.ano, estado.mes, estado.area);
  const porDia = agruparPorDia(doMes);
  const hojeData = hoje();

  renderizarGradeMes(exigirElemento('celebracoesCalendario'), {
    ano: estado.ano,
    mes: estado.mes,
    selecionado: estado.dia,
    marcas: (dia) => [...new Set((porDia.get(dia) || []).map((c) => AREA_POR_ID[c.pessoa.area].cor))],
    descricao: (dia) => {
      const total = (porDia.get(dia) || []).length;
      return total ? `${total} ${total === 1 ? 'celebração' : 'celebrações'}` : '';
    },
    aoSelecionar: (dia) => {
      estado.dia = estado.dia === dia ? null : dia;
      renderizar();
    },
    aoMudarMes: (delta) => {
      const alvo = new Date(estado.ano, estado.mes + delta, 1);
      estado.ano = alvo.getFullYear();
      estado.mes = alvo.getMonth();
      estado.dia = null;
      renderizar();
    },
    podeVoltar: !(estado.ano === hojeData.getFullYear() - 1 && estado.mes === 0),
    podeAvancar: !(estado.ano === hojeData.getFullYear() + 1 && estado.mes === 11),
  });

  const lista = estado.dia === null ? doMes : (porDia.get(estado.dia) || []);
  const titulo = estado.dia === null
    ? `${nomeMes(estado.mes)} de ${estado.ano}`
    : formatarData(new Date(estado.ano, estado.mes, estado.dia), { day: 'numeric', month: 'long' });
  exigirElemento('celebracoesTitulo').textContent = titulo;
  exigirElemento('celebracoesLimpar').hidden = estado.dia === null;
  exigirElemento('celebracoesLista').replaceChildren(criarGrupos(lista));
};

/** @returns {void} */
const renderizarChips = () => {
  const alvo = exigirElemento('celebracoesAreas');
  const opcoes = [{ id: 'todas', nome: 'Todas as áreas', cor: '' }, ...AREAS];
  alvo.replaceChildren(...opcoes.map((area) => {
    const filhos = [];
    if (area.cor) {
      const ponto = criarElemento('span', { classe: 'prot-ponto', atributos: { 'aria-hidden': 'true' } });
      ponto.style.setProperty('--cor-area', area.cor);
      filhos.push(ponto);
    }
    filhos.push(area.nome);
    return criarElemento('button', {
      classe: 'prot-chip',
      atributos: { type: 'button', 'aria-pressed': estado.area === area.id ? 'true' : 'false' },
      filhos,
      eventos: {
        click: () => {
          estado.area = area.id;
          estado.dia = null;
          alvo.querySelectorAll('.prot-chip').forEach((chip, i) => {
            chip.setAttribute('aria-pressed', opcoes[i].id === area.id ? 'true' : 'false');
          });
          renderizar();
        },
      },
    });
  }));
};

/**
 * Liga a página (uma vez).
 * @returns {void}
 */
export const iniciarCelebracoes = () => {
  const abas = Array.from(document.querySelectorAll('[data-modo]'));
  abas.forEach((aba) => {
    aba.addEventListener('click', () => {
      const modo = aba.getAttribute('data-modo') === 'entradas' ? 'entradas' : 'aniversarios';
      estado.modo = modo;
      estado.dia = null;
      abas.forEach((outra) => outra.setAttribute('aria-selected', outra === aba ? 'true' : 'false'));
      renderizar();
    });
  });
  exigirElemento('celebracoesLimpar').addEventListener('click', () => {
    estado.dia = null;
    renderizar();
  });
  renderizarChips();
  renderizar();
};
