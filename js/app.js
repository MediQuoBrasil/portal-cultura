/**
 * @file app.js
 * Ponto de entrada (módulo). Orquestra o ciclo de vida:
 *
 *   carregar → [sessão na aba?] ── sim → snapshot local → render imediato → check_update
 *                                  │                        (sem snapshot → bootstrap)
 *                                  └ não → tela de login (ping de aquecimento + One Tap)
 *   credencial do Google → bootstrap (tentativa única, 30 s) → semeia cache → render
 *   sessão expirada / conta trocada / acesso negado / sair → tela de login
 *
 * Nenhuma regra de acesso vive aqui: o servidor filtra o bootstrap por papel e valida o
 * token em toda requisição. O front só decide o que mostrar com o que recebeu.
 */

import {
  ErroApi, aquecerBackend, atualizarBootstrap, definirRenovadorToken, entrarComBootstrap,
} from './api.js';
import {
  encerrarGoogle, iniciarAuth, oferecerOneTap, renderizarBotaoGoogle, renovarToken,
} from './auth.js';
import { definirTodosFrescos, limparCache } from './cache.js';
import { configuracaoValida } from './config.js';
import { ouvir } from './eventos.js';
import { logErro, logInfo } from './log.js';
import {
  criarSessao, lerSessao, limparSessao, salvarSessao, tokenUtilizavel,
} from './sessao.js';
import {
  contenedorBotaoGoogle, definirErroLogin, definirValidandoLogin, iniciarShell, mostrarTela,
  renderizarApp, renderizarUsuario, telaAtual,
} from './shell.js';
import {
  garantirDonoDoCache, iniciarVigia, lerSnapshotLocal, pararVigia, semearBootstrap, verificarAgora,
} from './sincronia.js';
import { iniciarEfeitos } from './ui/efeitos.js';
import { iniciarTema, temaAtual } from './ui/tema.js';
import mostrarToast from './ui/toast.js';

/** @typedef {import('./sincronia.js').Snapshot} Snapshot */

/** Mensagens de login por código (as do servidor já são seguras; estas dão direção). */
const MENSAGENS_LOGIN = Object.freeze({
  PROIBIDO: 'Esta conta não tem acesso ao portal. Se você é profissional parceiro, peça à gestão de pessoas para ativar o seu cadastro.',
  NAO_AUTENTICADO: 'Não foi possível confirmar o seu login com o Google. Tente entrar de novo.',
  TOKEN_INVALIDO: 'O Google devolveu um login incompleto. Tente entrar de novo.',
  GIS_FALHOU: 'Não foi possível carregar o login do Google. Verifique a conexão e recarregue a página.',
  CONFIGURACAO: 'O portal ainda não foi configurado (endereço da API ou Client ID do Google).',
  SESSAO_EXPIRADA: 'Sua sessão expirou. Entre de novo para continuar.',
  CONTA_TROCADA: 'Você escolheu outra conta Google. Entre de novo com a conta que quer usar.',
  ACESSO_REVOGADO: 'Seu acesso ao portal foi desativado. Fale com a gestão de pessoas se isso for um engano.',
});

/** @type {{snapshot: ?Snapshot, gis: ?Promise<boolean>}} */
const estado = { snapshot: null, gis: null };

/**
 * @param {*} erro Erro do login.
 * @returns {string} Mensagem segura para a tela de login.
 */
const mensagemDeErroLogin = (erro) => {
  if (!(erro instanceof ErroApi)) return MENSAGENS_LOGIN.NAO_AUTENTICADO;
  return MENSAGENS_LOGIN[erro.codigo] || erro.message;
};

/**
 * Abre o app com um snapshot e liga a vigia de atualização.
 * @param {Snapshot} snapshot Dados.
 * @returns {void}
 */
const abrirApp = (snapshot) => {
  estado.snapshot = snapshot;
  renderizarApp(snapshot);
  iniciarVigia();
  if (snapshot.falhas.length > 0) {
    mostrarToast('Algumas seções não carregaram agora. Elas voltam na próxima atualização.', { tipo: 'alerta' });
  }
};

/**
 * Renderiza o botão do Google quando o GIS estiver pronto (ignora se o GIS falhou).
 * @returns {Promise<void>}
 */
const prepararBotaoGoogle = async () => {
  if (!estado.gis || !(await estado.gis) || telaAtual() !== 'login') return;
  try {
    await renderizarBotaoGoogle(contenedorBotaoGoogle(), temaAtual());
  } catch (erro) {
    logErro('botao_google_falhou', erro);
    definirErroLogin(MENSAGENS_LOGIN.GIS_FALHOU);
  }
};

/**
 * Mostra a tela de login (aquece o backend e oferece o One Tap).
 * @param {string} [mensagem] Mensagem a exibir.
 * @returns {Promise<void>}
 */
const irParaLogin = async (mensagem = '') => {
  pararVigia();
  mostrarTela('login');
  definirValidandoLogin(false);
  definirErroLogin(mensagem);
  aquecerBackend();
  await prepararBotaoGoogle();
  if (estado.gis && (await estado.gis)) oferecerOneTap();
};

/**
 * Login completo a partir de uma credencial nova do GIS (chamado pelo auth.js, que já
 * impede logins concorrentes).
 * @param {string} token ID token.
 * @returns {Promise<void>}
 */
const entrar = async (token) => {
  const inicio = performance.now();
  definirErroLogin('');
  definirValidandoLogin(true);
  try {
    const sessao = await criarSessao(token);
    if (!sessao) {
      definirErroLogin(MENSAGENS_LOGIN.TOKEN_INVALIDO);
      return;
    }
    salvarSessao(sessao);
    const data = await entrarComBootstrap();
    await garantirDonoDoCache(sessao.donoHash);
    const snapshot = await semearBootstrap(data);
    definirTodosFrescos(true);
    abrirApp(snapshot);
    logInfo('login_concluido', { ms: Math.round(performance.now() - inicio), papel: snapshot.me.papel });
  } catch (erro) {
    limparSessao();
    logErro('login_falhou', erro, { ms: Math.round(performance.now() - inicio) });
    definirErroLogin(mensagemDeErroLogin(erro));
  } finally {
    definirValidandoLogin(false);
  }
};

/**
 * Reabre a sessão da aba: cache local primeiro (render imediato, "tudo fresco" ligado já no
 * primeiro render — desempenho.md §5), depois o sinal global confirma ou atualiza.
 * @param {import('./sessao.js').Sessao} sessao Sessão válida.
 * @returns {Promise<boolean>} true se o app abriu.
 */
const retomarSessao = async (sessao) => {
  const local = await lerSnapshotLocal(sessao.donoHash);
  if (local) {
    definirTodosFrescos(true);
    abrirApp(local);
    verificarAgora({ forcar: true });
    logInfo('sessao_retomada_do_cache');
    return true;
  }
  try {
    const data = await atualizarBootstrap();
    await garantirDonoDoCache(sessao.donoHash);
    const snapshot = await semearBootstrap(data);
    definirTodosFrescos(true);
    abrirApp(snapshot);
    logInfo('sessao_retomada_da_rede');
    return true;
  } catch (erro) {
    logErro('retomada_falhou', erro);
    if (erro instanceof ErroApi && erro.codigo !== 'NAO_AUTENTICADO') limparSessao();
    return false;
  }
};

/**
 * Encerra a sessão: token, cache local (dado pessoal não fica no navegador) e auto-login.
 * @param {string} [mensagem] Mensagem para a tela de login.
 * @returns {Promise<void>}
 */
const sair = async (mensagem = '') => {
  pararVigia();
  limparSessao();
  estado.snapshot = null;
  encerrarGoogle();
  await limparCache();
  logInfo('sessao_encerrada');
  await irParaLogin(mensagem);
};

/** @returns {void} */
const ouvirEventosDeSessao = () => {
  ouvir('sessao:expirada', () => {
    if (telaAtual() !== 'app') return;
    limparSessao();
    irParaLogin(MENSAGENS_LOGIN.SESSAO_EXPIRADA);
  });
  ouvir('sessao:trocou_conta', () => sair(MENSAGENS_LOGIN.CONTA_TROCADA));
  ouvir('acesso:negado', () => sair(MENSAGENS_LOGIN.ACESSO_REVOGADO));
  ouvir('dados:atualizados', (snapshot) => {
    estado.snapshot = snapshot;
    renderizarUsuario(snapshot.me);
  });
};

/**
 * Inicialização da página.
 * @returns {Promise<void>}
 */
const iniciar = async () => {
  iniciarShell({ aoSair: () => sair() });
  iniciarTema({ aoMudar: () => { prepararBotaoGoogle(); } });
  iniciarEfeitos();
  ouvirEventosDeSessao();

  if (!configuracaoValida()) {
    logErro('configuracao_invalida', new Error('API_URL ou GIS_CLIENT_ID com placeholder'));
    mostrarTela('login');
    contenedorBotaoGoogle().toggleAttribute('hidden', true);
    definirErroLogin(MENSAGENS_LOGIN.CONFIGURACAO);
    return;
  }

  definirRenovadorToken(renovarToken);
  estado.gis = iniciarAuth({ aoCredencial: entrar })
    .then(() => true)
    .catch((erro) => {
      logErro('gis_indisponivel', erro);
      definirErroLogin(MENSAGENS_LOGIN.GIS_FALHOU);
      return false;
    });

  const sessao = lerSessao();
  if (sessao && tokenUtilizavel(0) && (await retomarSessao(sessao))) return;
  await irParaLogin();
};

iniciar().catch((erro) => {
  logErro('inicializacao_falhou', erro);
  mostrarTela('login');
  definirErroLogin('Não foi possível abrir o portal. Recarregue a página.');
});
