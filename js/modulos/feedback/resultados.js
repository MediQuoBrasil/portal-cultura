/**
 * @file modulos/feedback/resultados.js
 * Resultados agregados do feedback (gestão de pessoas e CEO; o servidor decide quem vê).
 *
 * Visualização: cada pergunta é uma distribuição de UMA série, então uma única cor (o
 * acento) e nenhuma legenda: o rótulo de cada linha e o valor na ponta da barra carregam
 * a leitura. As barras são linhas de uma `<table>` — a própria tabela é a visão acessível
 * (leitor de tela lê rótulo, quantidade e percentual). Texto nunca usa a cor da série.
 *
 * k-anonimato: o servidor não envia nada de um recorte com menos de K respostas; aqui só
 * se explica o porquê, sem números.
 */

import { ErroApi } from '../../api.js';
import { logErro } from '../../log.js';
import { criarElemento } from '../../ui/dom.js';
import { criarIcone } from '../../ui/icones.js';
import { criarEstadoEditor as criarEstado } from '../../editor/componentes.js';
import { carregarResultados, rotuloCiclo } from './dados.js';

/** @typedef {import('./dados.js').ResultadoPergunta} ResultadoPergunta */
/** @typedef {import('./dados.js').ResultadosFeedback} ResultadosFeedback */

/** Acima disso o rótulo quebra em linhas (coluna de largura fixa). */
const ROTULO_CURTO_MAX = 20;

const formatoPercentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const formatoMedia = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * @param {number} parte Parte.
 * @param {number} total Total.
 * @returns {number} Fração 0–1 (0 se total = 0).
 */
const fracao = (parte, total) => (total > 0 ? parte / total : 0);

/**
 * @param {number} n Quantidade.
 * @returns {string} "1 resposta" / "N respostas".
 */
const rotuloRespostas = (n) => `${n} ${n === 1 ? 'resposta' : 'respostas'}`;

/**
 * Tabela-gráfico de barras horizontais (uma série).
 * @param {string} legenda Descrição da tabela (caption, só para leitor de tela).
 * @param {Array<{rotulo: string, total: number}>} linhas Linhas na ordem de exibição.
 * @param {number} total Base do percentual.
 * @returns {HTMLElement} Tabela.
 */
export const criarBarras = (legenda, linhas, total) => {
  const maior = Math.max(1, ...linhas.map((l) => l.total));
  const longos = linhas.some((l) => l.rotulo.length > ROTULO_CURTO_MAX);
  return criarElemento('table', {
    classe: ['barras', longos ? 'barras--rotulos-longos' : ''],
    filhos: [
      criarElemento('caption', { classe: 'sr-only', texto: legenda }),
      criarElemento('thead', {
        classe: 'sr-only',
        filhos: [criarElemento('tr', {
          filhos: ['Resposta', 'Quantidade', 'Percentual'].map((t) => criarElemento('th', { texto: t, atributos: { scope: 'col' } })),
        })],
      }),
      criarElemento('tbody', {
        filhos: linhas.map((linha) => {
          const barra = criarElemento('span', { classe: 'barras__barra' });
          // Largura relativa à maior barra (a escala aproveita a faixa inteira); o texto
          // traz o percentual real sobre o total.
          barra.style.setProperty('--largura', `${(linha.total / maior) * 100}%`);
          return criarElemento('tr', {
            classe: ['barras__linha', linha.total === 0 ? 'barras__linha--zero' : ''],
            filhos: [
              criarElemento('th', { classe: 'barras__rotulo', texto: linha.rotulo, atributos: { scope: 'row' } }),
              criarElemento('td', {
                classe: 'barras__trilho',
                filhos: [barra, criarElemento('span', { classe: 'sr-only', texto: String(linha.total) })],
              }),
              criarElemento('td', {
                classe: 'barras__valor',
                filhos: [
                  criarElemento('span', { texto: formatoPercentual.format(fracao(linha.total, total)) }),
                  criarElemento('span', { classe: 'barras__qtd', texto: ` (${linha.total})`, atributos: { 'aria-hidden': 'true' } }),
                ],
              }),
            ],
          });
        }),
      }),
    ],
  });
};

/**
 * @param {string} rotulo Rótulo do número.
 * @param {string} valor Valor formatado.
 * @param {string} [complemento] Texto menor ao lado (ex.: "de 5").
 * @returns {HTMLElement} Figura de destaque da pergunta.
 */
const criarFigura = (rotulo, valor, complemento) => criarElemento('div', {
  classe: 'figura',
  filhos: [
    criarElemento('span', { classe: 'figura__rotulo rotulo', texto: rotulo }),
    criarElemento('span', {
      classe: 'figura__valor',
      filhos: [valor, complemento ? criarElemento('span', { classe: 'figura__complemento', texto: complemento }) : null],
    }),
  ],
});

/**
 * Corpo do resultado conforme o tipo da pergunta.
 * @param {ResultadoPergunta} r Resultado.
 * @returns {Array<?HTMLElement>} Elementos.
 */
const corpoDoResultado = (r) => {
  const n = r.n || 0;
  switch (r.tipo) {
    case 'escala_1_5':
      return [
        r.media === null ? null : criarFigura('Média', formatoMedia.format(r.media), ' de 5'),
        criarBarras(`Distribuição das notas de 1 a 5: ${r.texto}`, r.distribuicao, n),
      ];
    case 'nps_0_10': {
      const grupos = r.nps ? [
        { rotulo: 'Promotores (9–10)', total: r.nps.promotores },
        { rotulo: 'Neutros (7–8)', total: r.nps.neutros },
        { rotulo: 'Detratores (0–6)', total: r.nps.detratores },
      ] : [];
      return [
        r.nps ? criarFigura('NPS', String(r.nps.nps), ' de −100 a 100') : null,
        grupos.length > 0 ? criarBarras(`Grupos do NPS: ${r.texto}`, grupos, n) : null,
        criarElemento('details', {
          classe: 'resultado__detalhe',
          filhos: [
            criarElemento('summary', { texto: 'Ver notas de 0 a 10' }),
            criarBarras(`Distribuição das notas de 0 a 10: ${r.texto}`, r.distribuicao, n),
          ],
        }),
      ];
    }
    case 'multipla':
      return [criarBarras(`Distribuição das opções: ${r.texto}`, r.distribuicao, n)];
    default:
      return [
        criarElemento('p', {
          classe: 'resultado__nota texto-pequeno',
          filhos: [
            criarIcone('alerta', 'resultado__nota-icone'),
            'Textos aparecem em ordem aleatória. Mesmo assim, o jeito de escrever pode identificar quem respondeu: '
              + 'não tente descobrir autoria.',
          ],
        }),
        r.textos.length > 0
          ? criarElemento('ul', {
            classe: 'resultado__textos',
            filhos: r.textos.map((t) => criarElemento('li', { classe: 'resultado__texto', texto: t })),
          })
          : criarElemento('p', { classe: 'texto-mudo texto-pequeno', texto: 'Nenhum texto neste ciclo.' }),
      ];
  }
};

/**
 * @param {ResultadoPergunta} r Resultado.
 * @param {number} k K mínimo.
 * @returns {HTMLElement} Cartão da pergunta.
 */
const criarCartaoResultado = (r, k) => criarElemento('article', {
  classe: 'cartao resultado',
  filhos: [
    criarElemento('header', {
      classe: 'resultado__cabecalho',
      filhos: [
        criarElemento('h3', { classe: 'resultado__titulo', texto: r.texto }),
        criarElemento('span', { classe: 'resultado__n texto-pequeno texto-mudo', texto: r.suficiente ? rotuloRespostas(r.n || 0) : '' }),
      ],
    }),
    ...(r.suficiente ? corpoDoResultado(r) : [criarElemento('p', {
      classe: 'texto-mudo texto-pequeno',
      texto: `Menos de ${k} respostas nesta pergunta. O resultado fica oculto para não expor quem respondeu.`,
    })]),
  ],
});

/**
 * @param {ResultadosFeedback} res Resultados.
 * @returns {HTMLElement} Conteúdo dos resultados do ciclo.
 */
const criarConteudoResultados = (res) => {
  if (!res.suficiente) {
    return criarEstado({
      titulo: `Ainda não há respostas suficientes em ${rotuloCiclo(res.ciclo)}.`,
      texto: `Os resultados aparecem a partir de ${res.kMinimo} respostas, e as respostas entram em lotes: `
        + 'assim ninguém é identificado pela diferença entre duas consultas.',
      icone: 'escudo',
    });
  }
  return criarElemento('div', {
    classe: 'resultados__lista',
    filhos: [
      criarElemento('p', {
        classe: 'resultados__resumo',
        filhos: [
          criarElemento('strong', { texto: rotuloRespostas(res.respostas || 0) }),
          ` em ${rotuloCiclo(res.ciclo)}. Respostas recentes podem ainda não estar aqui: elas entram em lotes de ${res.kMinimo}.`,
        ],
      }),
      ...res.perguntas.map((r) => criarCartaoResultado(r, res.kMinimo)),
    ],
  });
};

/**
 * Seção de resultados com seletor de ciclo.
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.cicloAtual Ciclo vigente.
 * @param {function(): boolean} opcoes.vigente false quando a tela já mudou (descarta respostas).
 * @returns {HTMLElement} Seção.
 */
const criarResultados = ({ cicloAtual, vigente }) => {
  const area = criarElemento('div', { classe: 'resultados__area', atributos: { 'aria-live': 'polite', 'aria-busy': 'true' } });
  const idSelecao = 'feedbackCiclo';
  const selecao = criarElemento('select', {
    classe: 'campo resultados__ciclo',
    atributos: { id: idSelecao, disabled: true },
    filhos: [criarElemento('option', { texto: rotuloCiclo(cicloAtual), atributos: { value: cicloAtual } })],
  });
  let geracao = 0;

  const preencherCiclos = (ciclos, escolhido) => {
    const todos = [cicloAtual, ...ciclos.filter((c) => c !== cicloAtual)];
    selecao.replaceChildren(...todos.map((c) => criarElemento('option', {
      texto: c === cicloAtual ? `${rotuloCiclo(c)} (atual)` : rotuloCiclo(c),
      atributos: { value: c, selected: c === escolhido },
    })));
  };

  const carregar = async (ciclo) => {
    geracao += 1;
    const minha = geracao;
    area.setAttribute('aria-busy', 'true');
    area.replaceChildren(criarEstado({ titulo: 'Carregando resultados…', carregando: true }));
    try {
      const res = await carregarResultados(ciclo);
      if (minha !== geracao || !vigente()) return;
      preencherCiclos(res.ciclosDisponiveis, res.ciclo);
      area.replaceChildren(criarConteudoResultados(res));
    } catch (erro) {
      if (minha !== geracao || !vigente()) return;
      if (!(erro instanceof ErroApi)) logErro('feedback_resultados_falhou', erro);
      const proibido = erro instanceof ErroApi && erro.codigo === 'PROIBIDO';
      area.replaceChildren(criarEstado({
        titulo: proibido ? 'Sua conta não vê os resultados do feedback.' : 'Não foi possível carregar os resultados.',
        texto: proibido ? 'Quem vê é definido na configuração do portal.' : 'Verifique a conexão e tente de novo.',
        icone: 'alerta',
        acao: proibido ? null : criarElemento('button', {
          classe: 'botao botao--secundario botao--sm',
          texto: 'Tentar de novo',
          atributos: { type: 'button' },
          eventos: { click: () => { carregar(selecao.value); } },
        }),
      }));
    } finally {
      if (minha === geracao) {
        selecao.disabled = false;
        area.removeAttribute('aria-busy');
      }
    }
  };

  selecao.addEventListener('change', () => { carregar(selecao.value); });
  carregar('');

  return criarElemento('section', {
    classe: 'resultados',
    atributos: { 'aria-labelledby': 'feedbackResultadosTitulo' },
    filhos: [
      criarElemento('div', {
        classe: 'resultados__cabecalho',
        filhos: [
          criarElemento('h2', { classe: 'titulo-3', texto: 'Resultados', atributos: { id: 'feedbackResultadosTitulo' } }),
          criarElemento('div', {
            classe: 'campo-grupo resultados__filtro',
            filhos: [criarElemento('label', { classe: 'campo-rotulo', texto: 'Ciclo', atributos: { for: idSelecao } }), selecao],
          }),
        ],
      }),
      area,
    ],
  });
};

export default criarResultados;
