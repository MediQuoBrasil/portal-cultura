/**
 * @file util.js
 * Utilitários puros, sem dependência de DOM nem de rede.
 */

/**
 * @param {number} ms Milissegundos.
 * @returns {Promise<void>} Resolve após o intervalo.
 */
export const aguardar = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Backoff exponencial com jitter total ("full jitter"), limitado ao teto.
 * @param {number} tentativa Índice da nova tentativa (1, 2, …).
 * @param {number} baseMs Base.
 * @param {number} tetoMs Teto.
 * @returns {number} Espera em ms.
 */
export const calcularBackoff = (tentativa, baseMs, tetoMs) => {
  const limite = Math.min(tetoMs, baseMs * (2 ** (tentativa - 1)));
  return Math.round(limite / 2 + Math.random() * (limite / 2));
};

/**
 * Serialização determinística (chaves ordenadas) — chave estável de cache/single-flight.
 * @param {*} valor Valor JSON-serializável.
 * @returns {string} JSON canônico.
 */
export const serializarEstavel = (valor) => {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(serializarEstavel).join(',')}]`;
  const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${serializarEstavel(valor[k])}`).join(',')}}`;
};

/**
 * SHA-256 em hexadecimal (Web Crypto; exige contexto seguro: https ou localhost).
 * @param {string} texto Texto.
 * @returns {Promise<string>} Hash hex.
 */
export const sha256Hex = async (texto) => {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * @param {string} nome Nome completo.
 * @returns {string} Primeiro nome ('' se vazio).
 */
export const primeiroNome = (nome) => (typeof nome === 'string' ? nome.trim().split(/\s+/)[0] : '');

/**
 * @param {string} nome Nome completo.
 * @returns {string} Até duas iniciais em maiúsculas.
 */
export const iniciais = (nome) => {
  if (typeof nome !== 'string' || !nome.trim()) return '?';
  const partes = nome.trim().split(/\s+/);
  const ultimas = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return `${partes[0][0]}${ultimas}`.toUpperCase();
};

/**
 * @param {*} valor Valor.
 * @returns {boolean} true para objeto simples (não nulo, não array).
 */
export const ehObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
