/**
 * @file previa/conteudo.js
 * Páginas simples: Início (painéis de resumo), Protocolos (placeholders por área) e o
 * tratamento de mídias ausentes (fotos dos sócios e vídeo do case).
 */

import { AREAS } from './dados.js';
import { celebracoesProximas, criarLinhaCelebracao } from './celebracoes.js';
import { criarSeloStatus, proximaReuniao } from './reunioes.js';
import {
  criarElemento, criarIcone, exigirElemento, formatarData, mostrarToast,
} from './ui.js';

const JANELA_INICIO_DIAS = 14;
const MAXIMO_CELEBRACOES_INICIO = 5;

/* ─── Início ─────────────────────────────────────────────── */

/** @returns {string} Saudação pelo horário local. */
const saudacao = () => {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia, Ana.';
  if (hora < 18) return 'Boa tarde, Ana.';
  return 'Boa noite, Ana.';
};

/** @returns {void} */
const renderizarReuniaoInicio = () => {
  const reuniao = proximaReuniao();
  const alvo = exigirElemento('inicioReuniao');
  if (!reuniao) {
    alvo.replaceChildren(criarElemento('p', {
      classe: 'prot-vazio',
      texto: 'Nenhuma reunião marcada. Agende uma conversa individual com a gestão de saúde.',
    }));
    return;
  }
  alvo.replaceChildren(criarElemento('div', {
    classe: 'prot-reuniao',
    filhos: [
      criarElemento('div', {
        classe: 'prot-reuniao__topo',
        filhos: [
          criarElemento('span', {
            classe: 'prot-reuniao__quando',
            texto: `${formatarData(reuniao.data, { weekday: 'long', day: 'numeric', month: 'long' })} às ${reuniao.horario}`,
          }),
          criarSeloStatus(reuniao.status),
        ],
      }),
      criarElemento('ul', {
        classe: 'prot-reuniao__pautas',
        atributos: { 'aria-label': 'Pauta' },
        filhos: reuniao.pautas.map((p) => criarElemento('li', { classe: 'selo selo--neutro', texto: p })),
      }),
    ],
  }));
};

/**
 * Atualiza os painéis do Início (chamado a cada entrada na página).
 * @returns {void}
 */
export const aoEntrarInicio = () => {
  exigirElemento('saudacao').textContent = saudacao();
  const proximas = celebracoesProximas(JANELA_INICIO_DIAS).slice(0, MAXIMO_CELEBRACOES_INICIO);
  const lista = exigirElemento('inicioCelebracoes');
  if (proximas.length === 0) {
    lista.replaceChildren(criarElemento('li', { classe: 'prot-vazio', texto: 'Nenhuma celebração nas próximas duas semanas.' }));
  } else {
    lista.replaceChildren(...proximas.map((c) => criarLinhaCelebracao(c)));
  }
  renderizarReuniaoInicio();
};

/* ─── Protocolos ─────────────────────────────────────────── */

/** @returns {void} */
const iniciarProtocolos = () => {
  exigirElemento('listaProtocolos').replaceChildren(...AREAS.map((area) => {
    const caixa = criarElemento('span', { classe: 'icone-caixa prot-icone-area', filhos: [criarIcone('documento')] });
    caixa.style.setProperty('--cor-area', area.cor);
    return criarElemento('article', {
      classe: 'cartao spotlight prot-protocolo',
      filhos: [
        caixa,
        criarElemento('h2', { classe: 'prot-pratica__titulo', texto: `Protocolo de ${area.nome.toLowerCase()}` }),
        criarElemento('p', {
          classe: 'texto-mudo texto-pequeno',
          texto: 'Condutas, fluxos de encaminhamento e registros obrigatórios da área. Conteúdo ilustrativo.',
        }),
        criarElemento('div', {
          classe: 'prot-protocolo__rodape',
          filhos: [
            criarElemento('span', { classe: 'selo selo--neutro', texto: 'Versão 1.0' }),
            criarElemento('button', {
              classe: 'botao botao--secundario botao--sm',
              texto: 'Abrir protocolo',
              atributos: { type: 'button' },
              eventos: { click: () => mostrarToast(`No portal final, abre o PDF vigente do protocolo de ${area.nome.toLowerCase()}.`) },
            }),
          ],
        }),
      ],
    });
  }));
};

/* ─── Mídias ─────────────────────────────────────────────── */

/**
 * Foto ausente vira iniciais; vídeo ausente mostra orientação.
 * @returns {void}
 */
const iniciarMidias = () => {
  document.querySelectorAll('.prot-socio__foto img').forEach((imagem) => {
    const moldura = imagem.parentElement;
    const marcarVazia = () => {
      imagem.remove();
      if (moldura) moldura.classList.add('prot-socio__foto--vazia');
      console.warn('[prototipo] foto_socio_ausente');
    };
    if (!(imagem instanceof HTMLImageElement)) return;
    if (imagem.complete && imagem.naturalWidth === 0) marcarVazia();
    else imagem.addEventListener('error', marcarVazia, { once: true });
  });

  const video = /** @type {HTMLVideoElement} */ (exigirElemento('videoCase'));
  const mostrarErroVideo = () => {
    video.hidden = true;
    exigirElemento('videoErro').hidden = false;
    console.warn('[prototipo] video_case_ausente', { codigo: video.error ? video.error.code : null });
  };
  if (video.error) mostrarErroVideo();
  else video.addEventListener('error', mostrarErroVideo, { once: true });
};

/**
 * Liga as páginas simples (uma vez).
 * @returns {void}
 */
export const iniciarConteudo = () => {
  iniciarProtocolos();
  iniciarMidias();
};
