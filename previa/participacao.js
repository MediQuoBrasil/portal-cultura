/**
 * @file previa/participacao.js
 * Pesquisa de satisfação (CSAT 1–5 + sugestão) e enquete de horários para conhecer os
 * sócios. Simulação: validação no cliente só para a demonstração — no portal final a
 * validação e o anonimato são garantidos no servidor.
 */

import { PERGUNTAS_CSAT, opcoesEnquete } from './dados.js';
import {
  criarElemento, exigirElemento, formatarData, hoje, mostrarToast, nomeMes, somarDias,
} from './ui.js';

const LEGENDAS_NOTA = Object.freeze(['Muito insatisfeito', 'Insatisfeito', 'Neutro', 'Satisfeito', 'Muito satisfeito']);
const PARTICIPANTES_INICIAIS = 47;

/* ─── Pesquisa de satisfação ─────────────────────────────── */

/**
 * @param {{id: string, texto: string}} pergunta Pergunta.
 * @returns {HTMLElement} Fieldset com a escala 1–5.
 */
const criarPerguntaNota = (pergunta) => {
  const idLegenda = `csat-${pergunta.id}-legenda`;
  return criarElemento('fieldset', {
    classe: 'prot-nota',
    atributos: { 'data-pergunta': pergunta.id, 'aria-describedby': idLegenda },
    filhos: [
      criarElemento('legend', { classe: 'prot-nota__pergunta', texto: pergunta.texto }),
      criarElemento('div', {
        classe: 'prot-nota__opcoes',
        filhos: LEGENDAS_NOTA.map((legenda, i) => criarElemento('label', {
          classe: 'prot-nota__opcao',
          filhos: [
            criarElemento('input', {
              atributos: {
                type: 'radio', name: `csat-${pergunta.id}`, value: String(i + 1), 'aria-label': `${i + 1}, ${legenda.toLowerCase()}`,
              },
            }),
            criarElemento('span', { classe: 'prot-nota__valor', texto: String(i + 1), atributos: { 'aria-hidden': 'true' } }),
          ],
        })),
      }),
      criarElemento('div', {
        classe: 'prot-nota__legenda',
        atributos: { id: idLegenda },
        filhos: [criarElemento('span', { texto: '1, muito insatisfeito' }), criarElemento('span', { texto: '5, muito satisfeito' })],
      }),
    ],
  });
};

/**
 * @param {HTMLFormElement} formulario Formulário.
 * @returns {?Object<string, number>} Notas por pergunta, ou null se faltar alguma (marca os campos).
 */
const lerNotas = (formulario) => {
  /** @type {Object<string, number>} */
  const notas = {};
  let completo = true;
  PERGUNTAS_CSAT.forEach(({ id }) => {
    const marcada = formulario.querySelector(`input[name="csat-${id}"]:checked`);
    const grupo = formulario.querySelector(`[data-pergunta="${id}"]`);
    const valor = marcada instanceof HTMLInputElement ? Number(marcada.value) : NaN;
    const valido = Number.isInteger(valor) && valor >= 1 && valor <= 5;
    if (grupo) grupo.setAttribute('aria-invalid', valido ? 'false' : 'true');
    if (valido) notas[id] = valor;
    else completo = false;
  });
  return completo ? notas : null;
};

/** @returns {void} */
const iniciarCsat = () => {
  const formulario = /** @type {HTMLFormElement} */ (exigirElemento('csatFormulario'));
  const obrigado = exigirElemento('csatObrigado');
  const erro = exigirElemento('csatErro');
  const agora = hoje();
  exigirElemento('csatCiclo').textContent = `Ciclo de ${nomeMes(agora.getMonth()).toLowerCase()} de ${agora.getFullYear()}`;
  exigirElemento('csatPerguntas').replaceChildren(...PERGUNTAS_CSAT.map(criarPerguntaNota));

  formulario.addEventListener('change', (evento) => {
    const grupo = evento.target instanceof Element ? evento.target.closest('[data-pergunta]') : null;
    if (grupo) grupo.setAttribute('aria-invalid', 'false');
  });

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const notas = lerNotas(formulario);
    if (!notas) {
      erro.textContent = 'Responda às quatro perguntas de 1 a 5 para enviar.';
      const primeiro = formulario.querySelector('[aria-invalid="true"] input');
      if (primeiro instanceof HTMLElement) primeiro.focus();
      return;
    }
    erro.textContent = '';
    formulario.hidden = true;
    obrigado.hidden = false;
    const titulo = obrigado.querySelector('h2');
    if (titulo instanceof HTMLElement) {
      titulo.setAttribute('tabindex', '-1');
      titulo.focus();
    }
    mostrarToast('Respostas enviadas.', 'sucesso');
  });

  exigirElemento('csatNovamente').addEventListener('click', () => {
    formulario.reset();
    formulario.querySelectorAll('[aria-invalid]').forEach((g) => g.setAttribute('aria-invalid', 'false'));
    obrigado.hidden = true;
    formulario.hidden = false;
  });
};

/* ─── Enquete ────────────────────────────────────────────── */

/** @typedef {import('./dados.js').OpcaoEnquete} OpcaoEnquete */

/** @type {Array<OpcaoEnquete>} */
const opcoes = opcoesEnquete();
let participantes = PARTICIPANTES_INICIAIS;
let votou = false;

/**
 * @param {OpcaoEnquete} opcao Opção.
 * @param {number} maximo Maior número de votos.
 * @returns {HTMLElement} Linha da opção.
 */
const criarOpcao = (opcao, maximo) => {
  const barra = criarElemento('span', { classe: 'prot-opcao__barra', atributos: { 'aria-hidden': 'true' } });
  if (votou) barra.style.setProperty('--pct', `${Math.round((opcao.votos / Math.max(1, participantes)) * 100)}%`);
  const lider = votou && opcao.votos === maximo;
  return criarElemento('label', {
    classe: 'prot-opcao',
    filhos: [
      barra,
      criarElemento('input', {
        atributos: {
          type: 'checkbox', name: 'enquete', value: opcao.id, disabled: votou,
        },
      }),
      criarElemento('span', {
        classe: 'prot-opcao__textos',
        filhos: [
          criarElemento('span', { classe: 'prot-opcao__titulo', texto: formatarData(opcao.data, { weekday: 'long', day: 'numeric', month: 'long' }) }),
          criarElemento('span', { classe: 'prot-opcao__detalhe', texto: opcao.horario }),
        ],
      }),
      criarElemento('span', {
        classe: 'prot-opcao__votos',
        filhos: [
          lider ? criarElemento('span', { classe: 'selo selo--sucesso', texto: 'Mais votado' }) : null,
          votou ? ` ${opcao.votos} votos` : '',
        ],
      }),
    ],
  });
};

/**
 * @param {Set<string>} [marcadas] IDs marcados pelo usuário (para manter o check após votar).
 * @returns {void}
 */
const renderizarEnquete = (marcadas = new Set()) => {
  const maximo = Math.max(...opcoes.map((o) => o.votos));
  const linhas = opcoes.map((o) => criarOpcao(o, maximo));
  linhas.forEach((linha, i) => {
    const caixa = linha.querySelector('input');
    if (caixa instanceof HTMLInputElement) caixa.checked = marcadas.has(opcoes[i].id);
  });
  exigirElemento('enqueteOpcoes').replaceChildren(...linhas);
  exigirElemento('enqueteTotal').textContent = `${participantes} profissionais já responderam`;
  const botao = /** @type {HTMLButtonElement} */ (exigirElemento('enqueteEnviar'));
  botao.disabled = votou;
  botao.textContent = votou ? 'Disponibilidade enviada' : 'Enviar disponibilidade';
};

/** @returns {void} */
const iniciarEnquete = () => {
  const encerra = somarDias(hoje(), 5);
  exigirElemento('enqueteEncerra').textContent = `Encerra em ${formatarData(encerra, { day: '2-digit', month: '2-digit' })}`;
  exigirElemento('enqueteFormulario').addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (votou) return;
    const marcadas = new Set(Array.from(document.querySelectorAll('input[name="enquete"]:checked'))
      .map((caixa) => /** @type {HTMLInputElement} */ (caixa).value));
    const erro = exigirElemento('enqueteErro');
    if (marcadas.size === 0) {
      erro.textContent = 'Marque pelo menos um horário.';
      return;
    }
    erro.textContent = '';
    opcoes.forEach((o) => { if (marcadas.has(o.id)) o.votos += 1; }); // eslint-disable-line no-param-reassign
    participantes += 1;
    votou = true;
    renderizarEnquete(marcadas);
    mostrarToast('Disponibilidade enviada. O convite sai quando a enquete encerrar.', 'sucesso');
  });
  renderizarEnquete();
};

/**
 * Liga as duas páginas (uma vez).
 * @returns {void}
 */
export const iniciarParticipacao = () => {
  iniciarCsat();
  iniciarEnquete();
};
