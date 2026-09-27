/**
 * @file modulos/abas.js
 * Abas acessíveis (padrão WAI-ARIA "tabs" com ativação automática): setas esquerda/direita,
 * Home e End movem entre abas; só a aba ativa entra na ordem de Tab. O painel é criado sob
 * demanda a cada troca (o conteúdo de cada aba busca os próprios dados).
 *
 * A aba escolhida é lembrada em memória por `chave` enquanto a sessão durar: voltar à página
 * reabre onde a pessoa estava.
 */

import { criarElemento } from '../ui/dom.js';

/**
 * @typedef {Object} Aba
 * @property {string} id Identificador (único no grupo).
 * @property {string} rotulo Texto da aba.
 * @property {function(): HTMLElement} criar Cria o conteúdo do painel.
 */

/** @type {Map<string, string>} chave → id da última aba escolhida. */
const ultimaAba = new Map();

let sequencia = 0;

/**
 * Esquece as abas lembradas (fim de sessão).
 * @returns {void}
 */
export const limparAbas = () => ultimaAba.clear();

/**
 * Cria um grupo de abas.
 * @param {Object} opcoes Opções.
 * @param {string} opcoes.rotulo Nome acessível do grupo.
 * @param {Array<Aba>} opcoes.abas Abas (≥ 1).
 * @param {string} opcoes.chave Chave para lembrar a última aba.
 * @returns {HTMLElement} Grupo de abas com o painel.
 */
const criarAbas = ({ rotulo, abas, chave }) => {
  sequencia += 1;
  const base = `abas${sequencia}`;
  const painel = criarElemento('div', {
    classe: 'abas__painel',
    atributos: { role: 'tabpanel', tabindex: '0' },
  });
  const botoes = abas.map((aba) => criarElemento('button', {
    classe: 'abas__aba',
    atributos: {
      type: 'button', role: 'tab', id: `${base}-${aba.id}`, 'aria-controls': `${base}-painel`, 'data-aba': aba.id,
    },
    texto: aba.rotulo,
  }));
  painel.id = `${base}-painel`;

  const ativar = (indice, focar) => {
    const aba = abas[indice];
    botoes.forEach((b, i) => {
      const ativa = i === indice;
      b.setAttribute('aria-selected', String(ativa));
      b.setAttribute('tabindex', ativa ? '0' : '-1');
    });
    painel.setAttribute('aria-labelledby', botoes[indice].id);
    painel.replaceChildren(aba.criar());
    ultimaAba.set(chave, aba.id);
    if (focar) botoes[indice].focus();
  };

  botoes.forEach((botao, i) => {
    botao.addEventListener('click', () => {
      if (botao.getAttribute('aria-selected') !== 'true') ativar(i, false);
    });
    botao.addEventListener('keydown', (evento) => {
      const destinos = {
        ArrowRight: (i + 1) % botoes.length,
        ArrowLeft: (i - 1 + botoes.length) % botoes.length,
        Home: 0,
        End: botoes.length - 1,
      };
      if (!(evento.key in destinos)) return;
      evento.preventDefault();
      ativar(destinos[evento.key], true);
    });
  });

  const lembrada = abas.findIndex((a) => a.id === ultimaAba.get(chave));
  ativar(lembrada >= 0 ? lembrada : 0, false);

  return criarElemento('div', {
    classe: 'abas',
    filhos: [
      criarElemento('div', { classe: 'abas__lista', atributos: { role: 'tablist', 'aria-label': rotulo }, filhos: botoes }),
      painel,
    ],
  });
};

export default criarAbas;
