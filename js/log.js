/**
 * @file log.js
 * Log estruturado no console do navegador, com mascaramento de PII.
 *
 * Regras (system-prompt §8.1 + prompt.md §8.1):
 * - nunca registra token, credencial, payload de requisição, nome ou e-mail em claro;
 * - e-mails que aparecerem em qualquer texto são mascarados;
 * - o transporte (api.js) registra só ação, duração, código e `cid` — nunca o conteúdo,
 *   o que também preserva o anonimato do fluxo de feedback.
 */

import { CONFIG } from './config.js';

/** @typedef {'debug'|'info'|'aviso'|'erro'} NivelLog */

/** @type {Readonly<Object<NivelLog, number>>} */
const PESO_NIVEL = Object.freeze({
  debug: 10, info: 20, aviso: 30, erro: 40,
});

/** Chaves cujo valor nunca é registrado. */
const CHAVES_OMITIDAS = new Set([
  'token', 'credential', 'credencial', 'payload', 'email', 'nome', 'respostas', 'arquivo_base64',
]);

const REGEX_EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const NIVEL_MINIMO = CONFIG.DEBUG ? PESO_NIVEL.debug : PESO_NIVEL.info;

/**
 * @param {string} texto Texto livre.
 * @returns {string} Texto com e-mails mascarados (a***@dominio).
 */
const mascararTexto = (texto) => texto.replace(REGEX_EMAIL, '$1***@$2');

/**
 * Sanitiza um valor para log (rasa em objetos, até 2 níveis).
 * @param {*} valor Valor qualquer.
 * @param {number} [profundidade=0] Nível atual.
 * @returns {*} Valor seguro para registrar.
 */
const sanitizar = (valor, profundidade = 0) => {
  if (typeof valor === 'string') return mascararTexto(valor).slice(0, 500);
  if (valor === null || typeof valor !== 'object') return valor;
  if (profundidade >= 2) return '[objeto]';
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => sanitizar(v, profundidade + 1));
  return Object.fromEntries(Object.entries(valor).map(([chave, v]) => [
    chave,
    CHAVES_OMITIDAS.has(chave) ? '[omitido]' : sanitizar(v, profundidade + 1),
  ]));
};

/**
 * @param {NivelLog} nivel Nível.
 * @param {string} evento Nome do evento (snake_case).
 * @param {Object} [dados] Contexto adicional (será sanitizado).
 * @returns {void}
 */
const registrar = (nivel, evento, dados = {}) => {
  if (PESO_NIVEL[nivel] < NIVEL_MINIMO) return;
  const linha = {
    nivel, evento, quando: new Date().toISOString(), ...sanitizar(dados),
  };
  const metodo = {
    debug: 'debug', info: 'info', aviso: 'warn', erro: 'error',
  }[nivel];
  // eslint-disable-next-line no-console
  console[metodo]('[portal]', linha);
};

/**
 * @param {string} evento Evento.
 * @param {Object} [dados] Contexto.
 * @returns {void}
 */
export const logDebug = (evento, dados) => registrar('debug', evento, dados);

/**
 * @param {string} evento Evento.
 * @param {Object} [dados] Contexto.
 * @returns {void}
 */
export const logInfo = (evento, dados) => registrar('info', evento, dados);

/**
 * @param {string} evento Evento.
 * @param {Object} [dados] Contexto.
 * @returns {void}
 */
export const logAviso = (evento, dados) => registrar('aviso', evento, dados);

/**
 * Registra um erro com nome/mensagem/stack (stack só no console, nunca na UI).
 * @param {string} evento Evento.
 * @param {*} erro Erro capturado.
 * @param {Object} [dados] Contexto.
 * @returns {void}
 */
export const logErro = (evento, erro, dados = {}) => registrar('erro', evento, {
  ...dados,
  erro: erro instanceof Error
    ? {
      nome: erro.name, mensagem: erro.message, codigo: erro.codigo, stack: erro.stack,
    }
    : String(erro),
});
