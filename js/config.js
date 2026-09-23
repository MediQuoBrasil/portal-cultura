/**
 * @file config.js
 * Configuração do frontend e política de cache — fonte única, sem dependências.
 *
 * Os três placeholders (API_URL, GIS_CLIENT_ID e o domínio autorizado no Google Cloud)
 * são aceitos durante o desenvolvimento; `configuracaoValida()` impede o login enquanto
 * eles não forem trocados.
 */

/**
 * @typedef {Object} ConfigRetry
 * @property {number} LEITURA_MAX Novas tentativas de leitura (além da primeira).
 * @property {number} ESCRITA_MAX Novas tentativas de escrita, só em INDISPONIVEL.
 * @property {number} BASE_MS Base do backoff exponencial.
 * @property {number} TETO_MS Teto do backoff.
 */

/**
 * @typedef {Object} ConfigPortal
 * @property {string} API_URL URL `/exec` do Web App do Apps Script.
 * @property {string} GIS_CLIENT_ID Client ID OAuth (Google Identity Services).
 * @property {boolean} DEBUG Logs de depuração no console.
 * @property {number} VERSAO_CACHE Troque para descartar todo o cache local após mudança de formato.
 * @property {number} TIMEOUT_LOGIN_MS Login: tentativa única (desempenho.md §9.5).
 * @property {number} TIMEOUT_LEITURA_MS Folgado: não cancelar trabalho já feito no backend.
 * @property {number} TIMEOUT_ESCRITA_MS Timeout de escrita.
 * @property {number} TIMEOUT_CHECK_MS Timeout do `check_update`.
 * @property {number} INTERVALO_CHECK_MS Intervalo do `check_update` com a aba visível.
 * @property {number} CHECK_MIN_INTERVALO_MS Intervalo mínimo entre dois `check_update`.
 * @property {number} TIMEOUT_RENOVACAO_MS Espera máxima por um novo ID token silencioso.
 * @property {number} TOKEN_MARGEM_MS Renova o token quando faltar menos que isso para expirar.
 * @property {number} CORPO_MAX_CHARS Limite do corpo aceito pelo backend (setup.md §4.1).
 * @property {ConfigRetry} RETRY Política de novas tentativas.
 */

/** @type {Readonly<ConfigPortal>} */
export const CONFIG = Object.freeze({
  API_URL: 'https://script.google.com/macros/s/AKfycbwiwVzwtQrBuo7vLIgnoRTwNPaWgovuasqjBO7IsxipiMfIwTU1S0Cz0H0Q7UCpFIT3/exec',
  GIS_CLIENT_ID: '324245503326-dpujnejhmdq7rl9bsf0mvd88389p75e7.apps.googleusercontent.com',
  DEBUG: ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname ?? ''),
  VERSAO_CACHE: 1,
  TIMEOUT_LOGIN_MS: 30000,
  TIMEOUT_LEITURA_MS: 45000,
  TIMEOUT_ESCRITA_MS: 45000,
  TIMEOUT_CHECK_MS: 15000,
  INTERVALO_CHECK_MS: 5 * 60 * 1000,
  CHECK_MIN_INTERVALO_MS: 60 * 1000,
  TIMEOUT_RENOVACAO_MS: 20000,
  TOKEN_MARGEM_MS: 60 * 1000,
  CORPO_MAX_CHARS: 65536,
  RETRY: Object.freeze({
    LEITURA_MAX: 2,
    ESCRITA_MAX: 2,
    BASE_MS: 800,
    TETO_MS: 5000,
  }),
});

/** TTLs por volatilidade (desempenho.md §6), em ms. */
export const TTL = Object.freeze({
  ESTAVEL: 2 * 60 * 60 * 1000,
  VOLATIL: 5 * 60 * 1000,
});

/**
 * Ações cuja resposta PODE ir para o cache persistente (IndexedDB/localStorage), com o TTL
 * de cada uma. Allowlist = deny by default: qualquer ação fora daqui (resultados de feedback,
 * análise de consultas, votos nominais, envios) nunca é persistida — dado de nível 3 vive só
 * em memória (prompt.md §5.5).
 * @type {Readonly<Object<string, number>>}
 */
export const POLITICA_CACHE = Object.freeze({
  me: TTL.ESTAVEL,
  paginas: TTL.ESTAVEL,
  mural: TTL.ESTAVEL,
  enquetes_listar: TTL.VOLATIL,
  feedback_perguntas: TTL.VOLATIL,
});

/**
 * Campo do `bootstrap` → ação equivalente. O bootstrap reusa os handlers do backend, então
 * cada campo tem o mesmo shape da rota individual e semeia a chave dela (desempenho.md §4).
 * @type {Readonly<Object<string, string>>}
 */
export const MAPA_BOOTSTRAP = Object.freeze({
  me: 'me',
  conteudo: 'paginas',
  enquetes: 'enquetes_listar',
  mural: 'mural',
  feedback: 'feedback_perguntas',
});

/**
 * Invalidação explícita por ação de escrita: prefixos de chave a remover do cache local.
 * Verboso de propósito — invalidação incompleta serve dado velho sem erro visível.
 * @type {Readonly<Object<string, ReadonlyArray<string>>>}
 */
export const MAPA_INVALIDACAO = Object.freeze({
  feedback_enviar: Object.freeze(['feedback_perguntas']),
  enquete_votar: Object.freeze(['enquetes_listar']),
  enquete_criar: Object.freeze(['enquetes_listar']),
  enquete_atualizar: Object.freeze(['enquetes_listar']),
  enquete_fechar: Object.freeze(['enquetes_listar']),
  envio_reenviar: Object.freeze([]),
  publicar: Object.freeze(Object.keys(POLITICA_CACHE)),
  analise_reuniao_criar: Object.freeze([]),
  analise_caso_upload: Object.freeze([]),
  analise_caso_atualizar: Object.freeze([]),
});

/**
 * Rótulos exibidos para cada papel (vindos do servidor; o front só apresenta).
 * @type {Readonly<Object<string, string>>}
 */
export const ROTULOS_PAPEL = Object.freeze({
  profissional: 'Profissional parceiro',
  admin: 'Gestão de pessoas',
  ceo: 'CEO',
});

/**
 * @returns {boolean} true quando URL e Client ID deixaram de ser placeholders.
 */
export const configuracaoValida = () => (
  /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(CONFIG.API_URL)
  && /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(CONFIG.GIS_CLIENT_ID)
);
