/**
 * @file sessao.js
 * Guarda o ID token do Google para a aba atual.
 *
 * Decisão (prompt.md §5.3): cookie HttpOnly não sobrevive ao split Vercel + Apps Script, então
 * o token fica em memória com espelho em `sessionStorage` (escopo da aba, some ao fechá-la,
 * vida ≤ 1 h). Isso permite recarregar a página sem novo login. O servidor revalida a
 * assinatura em TODA requisição — o cliente nunca decide acesso com base no token.
 *
 * A decodificação local das claims serve só para agendar a renovação (`exp`) e identificar o
 * dono do cache local (hash do e-mail). Ela NÃO verifica assinatura e não é usada para
 * autorização.
 */

import { logAviso } from './log.js';
import { ehObjeto, sha256Hex } from './util.js';

const CHAVE_STORAGE = 'pc:sessao';

/**
 * @typedef {Object} Sessao
 * @property {string} token ID token (JWT) emitido pelo GIS.
 * @property {number} expiraEm Epoch em ms (`exp` do token).
 * @property {string} donoHash SHA-256 (hex) do e-mail — identifica o dono do cache local.
 */

/**
 * @typedef {Object} ClaimsToken
 * @property {number} expiraEm Epoch em ms.
 * @property {string} email E-mail normalizado (minúsculas).
 */

/** @type {?Sessao} */
let sessaoEmMemoria = null;

/**
 * Decodifica um segmento base64url em texto UTF-8.
 * @param {string} segmento Segmento do JWT.
 * @returns {string} Texto.
 */
const decodificarBase64Url = (segmento) => {
  const base64 = segmento.replace(/-/g, '+').replace(/_/g, '/');
  const preenchido = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binario = atob(preenchido);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/**
 * Lê `exp` e `email` do payload de um JWT, sem verificar assinatura.
 * @param {string} token JWT.
 * @returns {?ClaimsToken} Claims ou null se o formato for inválido.
 */
export const decodificarClaims = (token) => {
  if (typeof token !== 'string' || token.length > 8192) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const payload = JSON.parse(decodificarBase64Url(partes[1]));
    if (!ehObjeto(payload) || !Number.isFinite(payload.exp) || typeof payload.email !== 'string') {
      return null;
    }
    return { expiraEm: payload.exp * 1000, email: payload.email.trim().toLowerCase() };
  } catch (erro) {
    logAviso('token_claims_invalidas', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
    return null;
  }
};

/**
 * @param {*} valor Valor lido do storage.
 * @returns {boolean} true se tem o shape de Sessao.
 */
const ehSessao = (valor) => ehObjeto(valor)
  && typeof valor.token === 'string'
  && Number.isFinite(valor.expiraEm)
  && typeof valor.donoHash === 'string'
  && /^[0-9a-f]{64}$/.test(valor.donoHash);

/**
 * Monta uma sessão a partir de um ID token recém-recebido do GIS.
 * @param {string} token JWT.
 * @returns {Promise<?Sessao>} Sessão ou null (token malformado).
 */
export const criarSessao = async (token) => {
  const claims = decodificarClaims(token);
  if (!claims) return null;
  const donoHash = await sha256Hex(claims.email);
  return { token, expiraEm: claims.expiraEm, donoHash };
};

/**
 * @returns {?Sessao} Sessão atual (memória → sessionStorage) ou null.
 */
export const lerSessao = () => {
  if (sessaoEmMemoria) return sessaoEmMemoria;
  try {
    const bruto = sessionStorage.getItem(CHAVE_STORAGE);
    if (!bruto) return null;
    const valor = JSON.parse(bruto);
    if (!ehSessao(valor)) {
      sessionStorage.removeItem(CHAVE_STORAGE);
      return null;
    }
    sessaoEmMemoria = Object.freeze(valor);
    return sessaoEmMemoria;
  } catch (erro) {
    logAviso('sessao_leitura_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
    return null;
  }
};

/**
 * @param {Sessao} sessao Sessão a guardar.
 * @returns {void}
 */
export const salvarSessao = (sessao) => {
  if (!ehSessao(sessao)) throw new TypeError('sessão inválida');
  sessaoEmMemoria = Object.freeze({ ...sessao });
  try {
    sessionStorage.setItem(CHAVE_STORAGE, JSON.stringify(sessaoEmMemoria));
  } catch (erro) {
    // Sem storage (modo privado restrito): a sessão segue só em memória.
    logAviso('sessao_gravacao_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
  }
};

/** @returns {void} */
export const limparSessao = () => {
  sessaoEmMemoria = null;
  try {
    sessionStorage.removeItem(CHAVE_STORAGE);
  } catch (erro) {
    logAviso('sessao_limpeza_falhou', { motivo: erro instanceof Error ? erro.name : 'desconhecido' });
  }
};

/**
 * @param {number} margemMs Margem antes do `exp`.
 * @returns {?string} Token ainda utilizável com a margem, ou null.
 */
export const tokenUtilizavel = (margemMs) => {
  const sessao = lerSessao();
  if (!sessao || sessao.expiraEm - margemMs <= Date.now()) return null;
  return sessao.token;
};
