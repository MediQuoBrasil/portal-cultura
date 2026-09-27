/**
 * @file editor/dados.js
 * Acesso do editor ao backend (rotas `editor_*`, só admin — o servidor decide).
 *
 * - A estrutura do editor NÃO entra no cache persistente: `editor_estrutura` não está em
 *   `POLITICA_CACHE` (tem rascunhos e precisa refletir a planilha agora). Vive só em memória.
 * - Toda escrita devolve a estrutura atualizada: o editor redesenha com a verdade do
 *   servidor, sem segunda ida à rede.
 * - Escritas passam por uma fila: nunca duas ao mesmo tempo (a ordem das ações do admin é a
 *   ordem em que chegam ao servidor), e a reordenação pendente é enviada antes de qualquer
 *   outra escrita.
 * - A resposta é validada campo a campo (não confia no shape).
 */

import { escrever, ler } from '../api.js';
import { ehObjeto } from '../util.js';

/** @typedef {import('./catalogo.js').ContratoBloco} ContratoBloco */
/** @typedef {import('../blocos/renderizador.js').BlocoPublico} BlocoPublico */

/**
 * @typedef {Object} PaginaEditor
 * @property {string} id
 * @property {string} slug
 * @property {string} titulo
 * @property {string} icone
 * @property {string} tipo
 * @property {string} modulo
 * @property {Array<string>} papeis
 * @property {boolean} visivel
 * @property {number} linha
 * @property {number} total_blocos
 * @property {?string} problema
 * @property {string} problema_texto
 */

/**
 * @typedef {Object} BlocoEditor
 * @property {string} id
 * @property {string} pagina_id
 * @property {string} tipo
 * @property {string} titulo
 * @property {string} subtitulo
 * @property {string} texto
 * @property {string} midia
 * @property {string} link
 * @property {string} versao
 * @property {string} vigente_desde
 * @property {Array<string>} publico
 * @property {boolean} visivel
 * @property {number} linha
 * @property {?Object} previa Bloco como o portal entrega (null se inválido).
 * @property {?string} problema
 * @property {string} problema_texto
 */

/**
 * @typedef {Object} EstruturaEditor
 * @property {Array<PaginaEditor>} paginas
 * @property {Array<BlocoEditor>} blocos
 * @property {Object<string, ContratoBloco>} contratos
 * @property {Object<string, number>} limites
 * @property {Array<string>} tiposAgrupaveis
 * @property {Array<string>} modulos
 * @property {Array<string>} especialidades
 * @property {Array<string>} slugsReservados
 * @property {number} tituloPaginaMax
 */

const texto = (v) => (typeof v === 'string' ? v : '');
const listaTextos = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const numero = (v, padrao = 0) => (Number.isFinite(v) ? v : padrao);

/**
 * @param {*} bruto Página vinda do servidor.
 * @returns {PaginaEditor} Página normalizada.
 */
const normalizarPagina = (bruto) => ({
  id: texto(bruto.id),
  slug: texto(bruto.slug),
  titulo: texto(bruto.titulo),
  icone: texto(bruto.icone),
  tipo: texto(bruto.tipo),
  modulo: texto(bruto.modulo),
  papeis: listaTextos(bruto.papeis),
  visivel: bruto.visivel === true,
  linha: numero(bruto.linha),
  total_blocos: numero(bruto.total_blocos),
  problema: typeof bruto.problema === 'string' ? bruto.problema : null,
  problema_texto: texto(bruto.problema_texto),
});

/**
 * @param {*} bruto Bloco vindo do servidor.
 * @returns {BlocoEditor} Bloco normalizado.
 */
const normalizarBlocoEditor = (bruto) => ({
  id: texto(bruto.id),
  pagina_id: texto(bruto.pagina_id),
  tipo: texto(bruto.tipo),
  titulo: texto(bruto.titulo),
  subtitulo: texto(bruto.subtitulo),
  texto: texto(bruto.texto),
  midia: texto(bruto.midia),
  link: texto(bruto.link),
  versao: texto(bruto.versao),
  vigente_desde: texto(bruto.vigente_desde),
  publico: listaTextos(bruto.publico),
  visivel: bruto.visivel === true,
  linha: numero(bruto.linha),
  previa: ehObjeto(bruto.previa) ? bruto.previa : null,
  problema: typeof bruto.problema === 'string' ? bruto.problema : null,
  problema_texto: texto(bruto.problema_texto),
});

/**
 * @param {*} bruto Contratos vindos do servidor.
 * @returns {Object<string, ContratoBloco>} Contratos válidos.
 */
const normalizarContratos = (bruto) => {
  if (!ehObjeto(bruto)) return {};
  return Object.fromEntries(Object.entries(bruto)
    .filter(([, c]) => ehObjeto(c))
    .map(([tipo, c]) => [tipo, {
      obrigatorios: listaTextos(c.obrigatorios),
      permitidos: listaTextos(c.permitidos),
      midia: typeof c.midia === 'string' ? c.midia : null,
    }]));
};

/**
 * Valida e normaliza a estrutura (função pura).
 * @param {*} data `data` da rota.
 * @returns {EstruturaEditor} Estrutura.
 * @throws {TypeError} Se o shape mínimo não vier.
 */
export const normalizarEstrutura = (data) => {
  if (!ehObjeto(data) || !Array.isArray(data.paginas) || !Array.isArray(data.blocos)) {
    throw new TypeError('estrutura do editor inválida');
  }
  return {
    paginas: data.paginas.filter(ehObjeto).map(normalizarPagina),
    blocos: data.blocos.filter(ehObjeto).map(normalizarBlocoEditor),
    contratos: normalizarContratos(data.contratos),
    limites: ehObjeto(data.limites) ? data.limites : {},
    tiposAgrupaveis: listaTextos(data.tipos_agrupaveis),
    modulos: listaTextos(data.modulos),
    especialidades: listaTextos(data.especialidades),
    slugsReservados: listaTextos(data.slugs_reservados),
    tituloPaginaMax: numero(data.titulo_pagina_max, 80),
  };
};

/**
 * Lê a estrutura completa (sempre da rede).
 * @returns {Promise<EstruturaEditor>} Estrutura.
 */
export const carregarEstrutura = async () => normalizarEstrutura(
  await ler('editor_estrutura', {}, { forcarRede: true }),
);

/** @type {Promise<*>} Fila de escritas (serializa). */
let fila = Promise.resolve();

/**
 * Enfileira uma escrita; a próxima só começa quando a anterior terminar (com sucesso ou não).
 * @template T
 * @param {function(): Promise<T>} tarefa Escrita.
 * @returns {Promise<T>} Resultado da escrita.
 */
const enfileirar = (tarefa) => {
  const execucao = fila.then(tarefa, tarefa);
  fila = execucao.catch(() => undefined);
  return execucao;
};

/**
 * @typedef {Object} ResultadoEscrita
 * @property {string} id ID afetado ('' em reordenação).
 * @property {EstruturaEditor} estrutura Estrutura atualizada.
 * @property {number} [blocosExcluidos]
 */

/**
 * @param {string} acao Ação `editor_*`.
 * @param {Object} payload Payload.
 * @returns {Promise<ResultadoEscrita>} Resultado validado.
 */
const escreverNoEditor = (acao, payload) => enfileirar(async () => {
  const data = await escrever(acao, payload);
  if (!ehObjeto(data)) throw new TypeError('resposta de escrita inválida');
  return {
    id: texto(data.id),
    estrutura: normalizarEstrutura(data.estrutura),
    blocosExcluidos: numero(data.blocos_excluidos),
  };
});

/**
 * @param {Object} pagina Campos da página (`id` vazio = nova).
 * @returns {Promise<ResultadoEscrita>} Resultado.
 */
export const salvarPagina = (pagina) => escreverNoEditor('editor_pagina_salvar', pagina);

/**
 * @param {string} id Página.
 * @returns {Promise<ResultadoEscrita>} Resultado (com `blocosExcluidos`).
 */
export const excluirPagina = (id) => escreverNoEditor('editor_pagina_excluir', { id });

/**
 * @param {Object} bloco Campos do bloco (`id` vazio = novo).
 * @returns {Promise<ResultadoEscrita>} Resultado.
 */
export const salvarBloco = (bloco) => escreverNoEditor('editor_bloco_salvar', bloco);

/**
 * @param {string} id Bloco.
 * @returns {Promise<ResultadoEscrita>} Resultado.
 */
export const excluirBloco = (id) => escreverNoEditor('editor_bloco_excluir', { id });

/**
 * @param {'paginas'|'blocos'} escopo Escopo.
 * @param {Array<string>} ids IDs na nova ordem.
 * @param {string} [paginaId] Página (escopo `blocos`).
 * @returns {Promise<ResultadoEscrita>} Resultado.
 */
export const reordenar = (escopo, ids, paginaId) => escreverNoEditor('editor_reordenar', {
  escopo, ids, pagina_id: escopo === 'blocos' ? paginaId : undefined,
});
