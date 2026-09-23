/**
 * @file previa/app.js
 * Ponto de entrada do protótipo: tema, menu lateral, roteamento por hash (#/pagina?params)
 * e inicialização das páginas. Sem backend: todos os dados são fictícios (dados.js).
 */

import { aoEntrarArtes, iniciarArtes } from './artes.js';
import { iniciarCelebracoes } from './celebracoes.js';
import { aoEntrarInicio, iniciarConteudo } from './conteudo.js';
import { aoEntrarHistoria, iniciarHistoria } from './historia.js';
import { iniciarParticipacao } from './participacao.js';
import { aoEntrarReunioes, iniciarReunioes } from './reunioes.js';
import { exigirElemento, hidratarIcones, iniciarSpotlight } from './ui.js';

const PAGINA_PADRAO = 'inicio';
const CHAVE_TEMA = 'pc:tema'; // Mesma chave de js/tema-inicial.js: o tema escolhido vale nos dois.
const COR_BARRA = Object.freeze({ dark: '#050506', light: '#f7f7f8' });

/** @type {Readonly<Object<string, function(URLSearchParams): void>>} */
const AO_ENTRAR = Object.freeze({
  inicio: aoEntrarInicio,
  historia: aoEntrarHistoria,
  artes: aoEntrarArtes,
  reunioes: aoEntrarReunioes,
});

/* ─── Tema ───────────────────────────────────────────────── */

/**
 * @param {'dark'|'light'} tema Tema.
 * @returns {void}
 */
const aplicarTema = (tema) => {
  document.documentElement.setAttribute('data-theme', tema);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COR_BARRA[tema]);
  const rotulo = tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
  document.querySelectorAll('[data-acao="alternar-tema"]').forEach((botao) => {
    botao.setAttribute('aria-label', rotulo);
    botao.setAttribute('title', rotulo);
  });
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch (erro) {
    console.warn('[prototipo] tema_nao_persistido', erro instanceof Error ? erro.name : '');
  }
};

/** @returns {void} */
const iniciarTema = () => {
  const atual = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  aplicarTema(atual());
  document.querySelectorAll('[data-acao="alternar-tema"]').forEach((botao) => {
    botao.addEventListener('click', () => aplicarTema(atual() === 'dark' ? 'light' : 'dark'));
  });
};

/* ─── Menu lateral (gaveta abaixo de 1024px) ─────────────── */

/**
 * @param {boolean} aberto Estado desejado.
 * @returns {void}
 */
const definirMenu = (aberto) => {
  exigirElemento('lateral').setAttribute('data-aberto', aberto ? 'true' : 'false');
  exigirElemento('veuMenu').hidden = !aberto;
  const botao = exigirElemento('botaoMenu');
  botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
};

/** @returns {void} */
const iniciarMenu = () => {
  const botao = exigirElemento('botaoMenu');
  botao.addEventListener('click', () => definirMenu(botao.getAttribute('aria-expanded') !== 'true'));
  exigirElemento('veuMenu').addEventListener('click', () => definirMenu(false));
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && botao.getAttribute('aria-expanded') === 'true') {
      definirMenu(false);
      botao.focus();
    }
  });
};

/* ─── Rotas ──────────────────────────────────────────────── */

/**
 * @returns {{pagina: string, parametros: URLSearchParams}} Rota atual (página inexistente cai no Início).
 */
const lerRota = () => {
  const [caminho, consulta = ''] = globalThis.location.hash.replace(/^#\/?/, '').split('?');
  const existe = caminho && document.querySelector(`[data-pagina="${CSS.escape(caminho)}"]`);
  return { pagina: existe ? caminho : PAGINA_PADRAO, parametros: new URLSearchParams(consulta) };
};

/**
 * Mostra a página da rota atual.
 * @param {boolean} moverFoco Leva o foco ao título (navegação pelo usuário).
 * @returns {void}
 */
const navegar = (moverFoco) => {
  const { pagina, parametros } = lerRota();
  document.querySelectorAll('[data-pagina]').forEach((secao) => {
    // eslint-disable-next-line no-param-reassign
    secao.hidden = secao.getAttribute('data-pagina') !== pagina;
  });
  document.querySelectorAll('[data-rota]').forEach((link) => {
    if (link.getAttribute('data-rota') === pagina) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  definirMenu(false);

  const aoEntrar = AO_ENTRAR[pagina];
  if (aoEntrar) {
    try {
      aoEntrar(parametros);
    } catch (erro) {
      console.error('[prototipo] pagina_falhou', { pagina, erro });
    }
  }

  const titulo = document.querySelector(`[data-pagina="${pagina}"] h1`);
  if (titulo) document.title = `${titulo.textContent.trim()} | Portal de Cultura (protótipo)`;
  if (moverFoco) {
    globalThis.scrollTo({ top: 0 });
    if (titulo instanceof HTMLElement) titulo.focus({ preventScroll: true });
  }
};

/* ─── Diálogos ───────────────────────────────────────────── */

/** @returns {void} */
const iniciarDialogos = () => {
  document.querySelectorAll('[data-fechar-dialogo]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const dialogo = botao.closest('dialog');
      if (dialogo) dialogo.close();
    });
  });
  document.querySelectorAll('dialog').forEach((dialogo) => {
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) dialogo.close(); // clique no fundo
    });
  });
};

/* ─── Início ─────────────────────────────────────────────── */

/**
 * Inicializa um módulo isolando falhas: um erro em uma página não derruba as outras.
 * @param {string} nome Nome do módulo (para log).
 * @param {function(): (void|Promise<void>)} iniciar Função de início.
 * @returns {void}
 */
const iniciarModulo = (nome, iniciar) => {
  try {
    const resultado = iniciar();
    if (resultado instanceof Promise) {
      resultado.catch((erro) => console.error(`[prototipo] modulo_falhou: ${nome}`, erro));
    }
  } catch (erro) {
    console.error(`[prototipo] modulo_falhou: ${nome}`, erro);
  }
};

/** @returns {void} */
const iniciar = () => {
  const inicio = performance.now();
  hidratarIcones();
  iniciarTema();
  iniciarMenu();
  iniciarDialogos();
  iniciarSpotlight();
  // O link "Pular para o conteúdo" mudaria o hash e seria lido como rota: trata sem navegar.
  document.querySelectorAll('.pular-conteudo').forEach((link) => {
    link.addEventListener('click', (evento) => {
      evento.preventDefault();
      exigirElemento('conteudo').focus();
    });
  });
  document.querySelectorAll('[data-ano]').forEach((el) => {
    // eslint-disable-next-line no-param-reassign
    el.textContent = String(new Date().getFullYear());
  });

  iniciarModulo('conteudo', iniciarConteudo);
  iniciarModulo('celebracoes', iniciarCelebracoes);
  iniciarModulo('reunioes', iniciarReunioes);
  iniciarModulo('participacao', iniciarParticipacao);
  iniciarModulo('historia', iniciarHistoria);
  iniciarModulo('artes', iniciarArtes);

  globalThis.addEventListener('hashchange', () => navegar(true));
  navegar(false);
  console.info('[prototipo] pronto', { ms: Math.round(performance.now() - inicio) });
};

iniciar();
