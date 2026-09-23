/**
 * @file shell.js
 * Casca da interface: troca de telas (inicial/login/app), estados do login, topo com usuário,
 * menu móvel e hero de boas-vindas. Navegação e páginas entram na Fase 11 (`#navPrincipal`,
 * `#areaPagina`).
 */

import { ROTULOS_PAPEL } from './config.js';
import { criarElemento, definirTexto, exigirElemento } from './ui/dom.js';
import { reiniciarParallax, revelar } from './ui/efeitos.js';
import { iniciais, primeiroNome } from './util.js';

/** @typedef {'inicial'|'login'|'app'} NomeTela */
/** @typedef {import('./sincronia.js').Snapshot} Snapshot */

/** Texto do hero por papel: o que a pessoa encontra aqui, dito do ponto de vista dela. */
const TEXTO_HERO = Object.freeze({
  profissional: 'Aqui estão a nossa história, os protocolos de atendimento e os canais para você falar com a liderança.',
  admin: 'Veja o portal como os profissionais veem e cuide das enquetes, dos envios e da publicação.',
  ceo: 'Veja o portal como os profissionais veem e acompanhe a análise mensal de consultas.',
});

const MIDIA_DESKTOP = globalThis.matchMedia('(min-width: 768px)');

/** @type {NomeTela} */
let telaVisivel = 'inicial';

/** @returns {Object<string, HTMLElement>} Elementos da casca (resolvidos sob demanda). */
const elementos = () => ({
  telas: {
    inicial: exigirElemento('telaInicial'),
    login: exigirElemento('telaLogin'),
    app: exigirElemento('telaApp'),
  },
  botaoGoogle: exigirElemento('loginBotaoGoogle'),
  validando: exigirElemento('loginValidando'),
  erroLogin: exigirElemento('loginErro'),
  botaoMenu: exigirElemento('botaoMenu'),
  painelMenu: exigirElemento('painelMenu'),
  avatar: exigirElemento('usuarioAvatar'),
  nome: exigirElemento('usuarioNome'),
  papel: exigirElemento('usuarioPapel'),
  heroTitulo: exigirElemento('heroTitulo'),
  heroTexto: exigirElemento('heroTexto'),
});

/**
 * @param {boolean} aberto Estado desejado do menu móvel.
 * @returns {void}
 */
const definirMenu = (aberto) => {
  const { botaoMenu, painelMenu } = elementos();
  botaoMenu.setAttribute('aria-expanded', String(aberto));
  botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  painelMenu.setAttribute('data-aberto', String(aberto));
};

/** @returns {void} */
export const fecharMenu = () => definirMenu(false);

/**
 * Liga os controles estáticos da casca.
 * @param {{aoSair: function(): void}} opcoes Tratadores.
 * @returns {void}
 */
export const iniciarShell = ({ aoSair }) => {
  const ano = String(new Date().getFullYear());
  document.querySelectorAll('[data-ano]').forEach((el) => definirTexto(el, ano));

  const { botaoMenu } = elementos();
  botaoMenu.addEventListener('click', () => definirMenu(botaoMenu.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && botaoMenu.getAttribute('aria-expanded') === 'true') {
      fecharMenu();
      botaoMenu.focus();
    }
  });
  MIDIA_DESKTOP.addEventListener('change', (evento) => {
    if (evento.matches) fecharMenu();
  });
  exigirElemento('botaoSair').addEventListener('click', () => {
    fecharMenu();
    aoSair();
  });
};

/**
 * Mostra uma tela e esconde as demais (atributo `hidden`: só um `<main>` visível).
 * @param {NomeTela} nome Tela.
 * @returns {void}
 */
export const mostrarTela = (nome) => {
  const { telas } = elementos();
  Object.entries(telas).forEach(([chave, el]) => el.toggleAttribute('hidden', chave !== nome));
  document.body.setAttribute('data-estado', nome);
  telaVisivel = nome;
  if (nome !== 'app') fecharMenu();
  globalThis.scrollTo(0, 0);
  reiniciarParallax();
};

/** @returns {NomeTela} Tela visível. */
export const telaAtual = () => telaVisivel;

/**
 * @param {string} mensagem Mensagem segura ('' esconde).
 * @returns {void}
 */
export const definirErroLogin = (mensagem) => {
  const { erroLogin } = elementos();
  definirTexto(erroLogin, mensagem || '');
  erroLogin.toggleAttribute('hidden', !mensagem);
};

/**
 * Alterna entre o botão do Google e o aviso "Validando seu acesso…".
 * @param {boolean} ativo true durante o login.
 * @returns {void}
 */
export const definirValidandoLogin = (ativo) => {
  const { botaoGoogle, validando } = elementos();
  botaoGoogle.toggleAttribute('hidden', ativo);
  validando.toggleAttribute('hidden', !ativo);
};

/** @returns {HTMLElement} Contêiner do botão oficial do Google. */
export const contenedorBotaoGoogle = () => elementos().botaoGoogle;

/**
 * Preenche topo e hero com o perfil (texto sempre via textContent).
 * @param {import('./sincronia.js').Perfil} perfil Perfil do usuário.
 * @returns {void}
 */
export const renderizarUsuario = (perfil) => {
  const {
    avatar, nome, papel, heroTitulo, heroTexto,
  } = elementos();
  definirTexto(avatar, iniciais(perfil.nome));
  definirTexto(nome, perfil.nome || 'Profissional');
  definirTexto(papel, ROTULOS_PAPEL[perfil.papel] || '');

  const primeiro = primeiroNome(perfil.nome);
  heroTitulo.replaceChildren(
    primeiro ? 'Olá, ' : 'Olá',
    primeiro ? criarElemento('span', { classe: 'texto-acento', texto: primeiro }) : '',
    '.',
  );
  definirTexto(heroTexto, TEXTO_HERO[perfil.papel] || TEXTO_HERO.profissional);
};

/**
 * Abre a tela do app com o snapshot.
 * @param {Snapshot} snapshot Dados.
 * @returns {void}
 */
export const renderizarApp = (snapshot) => {
  renderizarUsuario(snapshot.me);
  mostrarTela('app');
  revelar(elementos().telas.app);
};
