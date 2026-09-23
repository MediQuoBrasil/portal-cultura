/**
 * @file previa/historia.js
 * Exibe previa/historia.pdf página a página em <canvas> com pdf.js hospedado na própria
 * pasta previa/. Motivo: a CSP do vercel.json bloqueia <iframe>/<embed> de PDF
 * (frame-src e object-src) e scripts de CDN (script-src 'self').
 * Carregamento preguiçoso: a biblioteca (~1,8 MB) só é baixada ao abrir a página.
 */

import { exigirElemento } from './ui.js';

const URL_PDF = new URL('./historia.pdf', import.meta.url).href;
const URL_BIBLIOTECA = new URL('./pdf.min.js', import.meta.url).href;
const URL_WORKER = new URL('./pdf.worker.min.js', import.meta.url).href;
const ESCALA_MAXIMA = 2.5;

/** @type {?Promise<void>} Carga única (single-flight). */
let carga = null;
/** @type {?{numPages: number, getPage: function(number): Promise<*>}} */
let documentoPdf = null;
let paginaAtual = 1;
/** @type {?{cancel: function(): void}} */
let renderizacaoEmCurso = null;

/** @returns {void} */
const atualizarControles = () => {
  const total = documentoPdf ? documentoPdf.numPages : 0;
  exigirElemento('pdfPagina').textContent = total ? `Página ${paginaAtual} de ${total}` : '';
  /** @type {HTMLButtonElement} */ (exigirElemento('pdfAnterior')).disabled = !total || paginaAtual <= 1;
  /** @type {HTMLButtonElement} */ (exigirElemento('pdfProxima')).disabled = !total || paginaAtual >= total;
};

/**
 * @param {string} mensagem Mensagem ao usuário.
 * @returns {void}
 */
const mostrarErro = (mensagem) => {
  exigirElemento('pdfEsqueleto').hidden = true;
  exigirElemento('pdfCanvas').hidden = true;
  const erro = exigirElemento('pdfErro');
  erro.textContent = mensagem;
  erro.hidden = false;
  exigirElemento('pdfPagina').textContent = '';
};

/**
 * Renderiza a página atual ajustada à largura do palco (nítida em telas de alta densidade).
 * @returns {Promise<void>}
 */
const renderizarPagina = async () => {
  if (!documentoPdf) return;
  if (renderizacaoEmCurso) renderizacaoEmCurso.cancel();
  const inicio = performance.now();
  const pagina = await documentoPdf.getPage(paginaAtual);
  const palco = exigirElemento('pdfPalco');
  const canvas = /** @type {HTMLCanvasElement} */ (exigirElemento('pdfCanvas'));
  const larguraDisponivel = Math.max(280, palco.clientWidth - 32);
  const base = pagina.getViewport({ scale: 1 });
  const escalaCss = larguraDisponivel / base.width;
  const densidade = Math.min(globalThis.devicePixelRatio || 1, 2);
  const viewport = pagina.getViewport({ scale: Math.min(escalaCss * densidade, ESCALA_MAXIMA * densidade) });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / densidade)}px`;
  canvas.setAttribute('aria-label', `Página ${paginaAtual} da apresentação sobre a história da MediQuo`);
  canvas.setAttribute('role', 'img');

  const tarefa = pagina.render({ canvasContext: canvas.getContext('2d'), viewport });
  renderizacaoEmCurso = tarefa;
  try {
    await tarefa.promise;
    exigirElemento('pdfEsqueleto').hidden = true;
    canvas.hidden = false;
    console.info('[prototipo] pdf_pagina_renderizada', { pagina: paginaAtual, ms: Math.round(performance.now() - inicio) });
  } catch (erro) {
    if (erro && erro.name === 'RenderingCancelledException') return;
    throw erro;
  } finally {
    if (renderizacaoEmCurso === tarefa) renderizacaoEmCurso = null;
  }
  atualizarControles();
};

/**
 * @param {number} delta -1 ou +1.
 * @returns {void}
 */
const mudarPagina = (delta) => {
  if (!documentoPdf) return;
  const alvo = Math.min(documentoPdf.numPages, Math.max(1, paginaAtual + delta));
  if (alvo === paginaAtual) return;
  paginaAtual = alvo;
  renderizarPagina().catch((erro) => console.error('[prototipo] pdf_render_falhou', erro));
};

/**
 * Importa o pdf.js e abre o documento.
 * @returns {Promise<void>}
 */
const carregar = async () => {
  const inicio = performance.now();
  console.info('[prototipo] pdf_carga_inicio');
  let pdfjs;
  try {
    pdfjs = await import(URL_BIBLIOTECA);
  } catch (erro) {
    console.error('[prototipo] pdfjs_import_falhou', erro);
    mostrarErro('O leitor de PDF não carregou. Confira se previa/pdf.min.js e previa/pdf.worker.min.js foram enviados.');
    return;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = URL_WORKER;
  try {
    // isEvalSupported:false evita new Function(), que a CSP (sem 'unsafe-eval') bloquearia.
    documentoPdf = await pdfjs.getDocument({ url: URL_PDF, isEvalSupported: false }).promise;
  } catch (erro) {
    console.error('[prototipo] pdf_abrir_falhou', { nome: erro && erro.name, status: erro && erro.status });
    mostrarErro('A apresentação não carregou. Confira se o arquivo previa/historia.pdf foi enviado ao repositório.');
    return;
  }
  console.info('[prototipo] pdf_carga_fim', { paginas: documentoPdf.numPages, ms: Math.round(performance.now() - inicio) });
  await renderizarPagina();
};

/**
 * Ao entrar na página: carrega na primeira vez, re-renderiza nas seguintes (a largura pode ter mudado).
 * @returns {void}
 */
export const aoEntrarHistoria = () => {
  if (!carga) {
    carga = carregar().catch((erro) => {
      console.error('[prototipo] pdf_falha_inesperada', erro);
      mostrarErro('Não foi possível exibir a apresentação agora. Use o botão Baixar PDF.');
    });
    return;
  }
  carga.then(() => renderizarPagina()).catch(() => {});
};

/**
 * Liga os controles (uma vez).
 * @returns {void}
 */
export const iniciarHistoria = () => {
  exigirElemento('pdfAnterior').addEventListener('click', () => mudarPagina(-1));
  exigirElemento('pdfProxima').addEventListener('click', () => mudarPagina(1));
  exigirElemento('pdfPalco').addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowLeft') mudarPagina(-1);
    if (evento.key === 'ArrowRight') mudarPagina(1);
  });
  let espera = 0;
  globalThis.addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      const visivel = !exigirElemento('pdfPalco').closest('[hidden]');
      if (documentoPdf && visivel) renderizarPagina().catch(() => {});
    }, 200);
  });
};
