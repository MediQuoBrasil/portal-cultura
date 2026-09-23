/**
 * @file auth.js
 * Login com Google Identity Services (One Tap + botão oficial) — GoogleOneTap.txt.
 *
 * - O GIS é carregado sob demanda (script injetado uma vez) e inicializado uma vez.
 * - Guarda de concorrência: um reclique ou uma segunda credencial não enfileira outro login
 *   no backend enquanto o primeiro está em voo (desempenho.md §9.4).
 * - Renovação silenciosa: `renovarToken()` pede um novo ID token pelo One Tap (auto_select).
 *   Se o Google devolver OUTRA conta, a sessão não é trocada em silêncio: emite
 *   `sessao:trocou_conta` e a app encerra a sessão atual.
 * - Nenhuma decisão de acesso acontece aqui: quem valida o token é o servidor.
 */

import { CONFIG } from './config.js';
import { emitir } from './eventos.js';
import {
  logAviso, logErro, logInfo,
} from './log.js';
import { criarSessao, lerSessao, salvarSessao } from './sessao.js';

const URL_GIS = 'https://accounts.google.com/gsi/client';
/** Após uma renovação que falhou, não insiste por este tempo (evita prompts em rajada). */
const PAUSA_APOS_FALHA_MS = 15000;

/**
 * @typedef {Object} RespostaCredencial
 * @property {string} credential ID token (JWT).
 * @property {string} [select_by] Como o usuário escolheu a conta.
 */

/** @type {?Promise<Object>} API `google.accounts.id` carregada. */
let gisPromessa = null;
let gisInicializado = false;
let loginEmVoo = false;

/** @type {?function(string): Promise<void>} */
let aoCredencialLogin = null;

/** @type {?Promise<boolean>} */
let renovacaoPromessa = null;
/** @type {?function(boolean): void} */
let resolverRenovacao = null;
/** @type {?ReturnType<typeof setTimeout>} */
let temporizadorRenovacao = null;
let ultimaFalhaRenovacao = 0;

/** @returns {?Object} `google.accounts.id`, se já carregado. */
const apiGisCarregada = () => {
  const { google } = globalThis;
  return google && google.accounts && google.accounts.id ? google.accounts.id : null;
};

/** @returns {Promise<Object>} `google.accounts.id`. */
const carregarGis = () => {
  if (gisPromessa) return gisPromessa;
  gisPromessa = new Promise((resolve, reject) => {
    const existente = apiGisCarregada();
    if (existente) {
      resolve(existente);
      return;
    }
    const script = document.createElement('script');
    script.src = URL_GIS;
    script.async = true;
    script.addEventListener('load', () => {
      const api = apiGisCarregada();
      if (api) resolve(api);
      else reject(new Error('gis_sem_api'));
    });
    script.addEventListener('error', () => reject(new Error('gis_falhou_ao_carregar')));
    document.head.append(script);
  }).catch((erro) => {
    gisPromessa = null; // permite nova tentativa (ex.: rede voltou)
    throw erro;
  });
  return gisPromessa;
};

/**
 * Conclui a renovação pendente (idempotente).
 * @param {boolean} sucesso Resultado.
 * @param {string} motivo Motivo (log).
 * @returns {void}
 */
const concluirRenovacao = (sucesso, motivo) => {
  if (!resolverRenovacao) return;
  clearTimeout(temporizadorRenovacao);
  const resolver = resolverRenovacao;
  resolverRenovacao = null;
  renovacaoPromessa = null;
  temporizadorRenovacao = null;
  if (!sucesso) ultimaFalhaRenovacao = Date.now();
  logInfo('token_renovacao_concluida', { sucesso, motivo });
  resolver(sucesso);
};

/**
 * Credencial recebida durante uma renovação: aceita só se for a mesma conta.
 * @param {string} token Novo ID token.
 * @returns {Promise<void>}
 */
const aplicarRenovacao = async (token) => {
  const nova = await criarSessao(token);
  const atual = lerSessao();
  if (!nova) {
    concluirRenovacao(false, 'token_malformado');
    return;
  }
  if (atual && atual.donoHash !== nova.donoHash) {
    concluirRenovacao(false, 'outra_conta');
    emitir('sessao:trocou_conta');
    return;
  }
  salvarSessao(nova);
  concluirRenovacao(true, 'ok');
};

/**
 * Callback único do GIS (One Tap e botão).
 * @param {RespostaCredencial} resposta Resposta do GIS.
 * @returns {Promise<void>}
 */
const tratarCredencial = async (resposta) => {
  const token = resposta && typeof resposta.credential === 'string' ? resposta.credential : null;
  if (!token) {
    logAviso('gis_credencial_vazia');
    concluirRenovacao(false, 'credencial_vazia');
    return;
  }
  if (resolverRenovacao) {
    await aplicarRenovacao(token);
    return;
  }
  if (loginEmVoo) {
    logInfo('login_ignorado_em_voo');
    return;
  }
  if (!aoCredencialLogin) {
    logAviso('login_sem_tratador');
    return;
  }
  loginEmVoo = true;
  try {
    await aoCredencialLogin(token);
  } catch (erro) {
    logErro('login_tratador_falhou', erro);
  } finally {
    loginEmVoo = false;
  }
};

/**
 * @param {Object} gis `google.accounts.id`.
 * @returns {void}
 */
const inicializarUmaVez = (gis) => {
  if (gisInicializado) return;
  gis.initialize({
    client_id: CONFIG.GIS_CLIENT_ID,
    callback: tratarCredencial,
    auto_select: true,
    cancel_on_tap_outside: false,
    context: 'signin',
    ux_mode: 'popup',
    itp_support: true,
    use_fedcm_for_prompt: true,
  });
  gisInicializado = true;
};

/**
 * Carrega e inicializa o GIS.
 * @param {{aoCredencial: function(string): Promise<void>}} opcoes Tratador do login completo.
 * @returns {Promise<void>} Rejeita se o script do Google não carregar.
 */
export const iniciarAuth = async ({ aoCredencial }) => {
  aoCredencialLogin = aoCredencial;
  const gis = await carregarGis();
  inicializarUmaVez(gis);
  logInfo('gis_pronto');
};

/**
 * Renderiza o botão oficial "Fazer login com o Google" no contêiner.
 * @param {HTMLElement} contenedor Contêiner vazio.
 * @param {'dark'|'light'} tema Tema atual.
 * @returns {Promise<void>}
 */
export const renderizarBotaoGoogle = async (contenedor, tema) => {
  const gis = await carregarGis();
  inicializarUmaVez(gis);
  contenedor.replaceChildren();
  gis.renderButton(contenedor, {
    type: 'standard',
    theme: tema === 'dark' ? 'filled_black' : 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    locale: 'pt-BR',
    width: Math.max(200, Math.min(contenedor.clientWidth || 320, 400)),
  });
};

/**
 * Mostra o One Tap na tela de login (sem esperar resultado: o callback cuida do login).
 * @returns {Promise<void>}
 */
export const oferecerOneTap = async () => {
  try {
    const gis = await carregarGis();
    inicializarUmaVez(gis);
    gis.prompt();
  } catch (erro) {
    logAviso('one_tap_indisponivel', { motivo: erro instanceof Error ? erro.message : 'desconhecido' });
  }
};

/**
 * Pede um novo ID token em silêncio. Single-flight: chamadas concorrentes compartilham o
 * mesmo pedido. Resolve false em timeout, se o One Tap não puder aparecer, ou se falhou há
 * pouco (sem insistir).
 * @returns {Promise<boolean>} true se um novo token da MESMA conta foi salvo.
 */
export const renovarToken = () => {
  if (renovacaoPromessa) return renovacaoPromessa;
  if (Date.now() - ultimaFalhaRenovacao < PAUSA_APOS_FALHA_MS) return Promise.resolve(false);
  renovacaoPromessa = new Promise((resolve) => {
    resolverRenovacao = resolve;
    temporizadorRenovacao = setTimeout(() => concluirRenovacao(false, 'timeout'), CONFIG.TIMEOUT_RENOVACAO_MS);
  });
  carregarGis()
    .then((gis) => {
      inicializarUmaVez(gis);
      gis.prompt((notificacao) => {
        const chamar = (metodo) => typeof notificacao[metodo] === 'function' && notificacao[metodo]();
        if (chamar('isNotDisplayed') || chamar('isSkippedMoment')) {
          concluirRenovacao(false, 'prompt_nao_exibido');
        } else if (chamar('isDismissedMoment') && chamar('getDismissedReason') !== 'credential_returned') {
          concluirRenovacao(false, 'prompt_dispensado');
        }
      });
    })
    .catch((erro) => {
      logErro('gis_indisponivel_na_renovacao', erro);
      concluirRenovacao(false, 'gis_indisponivel');
    });
  return renovacaoPromessa;
};

/**
 * No logout: impede o auto-login imediato e fecha prompts abertos.
 * @returns {void}
 */
export const encerrarGoogle = () => {
  concluirRenovacao(false, 'logout');
  if (!gisPromessa) return;
  gisPromessa
    .then((gis) => {
      gis.disableAutoSelect();
      gis.cancel();
    })
    .catch(() => {
      // GIS não carregou: não há auto-login a desativar.
    });
};
