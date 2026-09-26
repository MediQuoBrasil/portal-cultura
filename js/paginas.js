/**
 * @file paginas.js
 * Área principal do app. A navegação e o conteúdo vêm de dados (`paginas` + `blocos`,
 * entregues no bootstrap e já filtrados por papel/especialidade no servidor):
 *
 *   #/          → hero + grade bento com as seções do portal
 *   #/<slug>    → página `conteudo` (blocos) ou `modulo` (feedback, enquetes… — Fase 12)
 *   outro slug  → "página não encontrada" (inclui página sem permissão: o servidor nem a envia)
 *
 * Renderizações concorrentes (troca rápida de rota enquanto o Markdown carrega) são
 * descartadas por um contador de geração: só a última pinta a tela.
 */

import { marcarPaginaAtual, renderizarNavegacao } from './navegacao.js';
import { renderizarBlocos } from './blocos/renderizador.js';
import { logErro } from './log.js';
import { ouvirRotas, rotaAtual } from './rotas.js';
import { definirHeroVisivel, fecharMenu } from './shell.js';
import { criarElemento, exigirElemento } from './ui/dom.js';
import { reiniciarParallax, revelar } from './ui/efeitos.js';
import { criarIcone, iconeExiste } from './ui/icones.js';
import { ehObjeto } from './util.js';

/** @typedef {import('./rotas.js').Rota} Rota */
/** @typedef {import('./sincronia.js').Snapshot} Snapshot */

/**
 * @typedef {Object} PaginaPublica Página como o servidor entrega (Conteudo.gs).
 * @property {string} id
 * @property {string} slug
 * @property {string} titulo
 * @property {string} icone
 * @property {number} ordem
 * @property {'conteudo'|'modulo'} tipo
 * @property {string} modulo
 * @property {Array<*>} blocos Normalizados no renderizador.
 */

/**
 * @typedef {Object} ConteudoPortal
 * @property {Array<PaginaPublica>} paginas
 * @property {Array<string>|undefined} tiposAgrupaveis
 */

/**
 * @typedef {Object} TextoEstado
 * @property {string} titulo Frase curta do estado.
 * @property {string} texto Orientação do que fazer.
 * @property {string} [icone='info'] Ícone.
 */

const TITULO_DOCUMENTO = 'Portal de Cultura | MediQuo';
const REGEX_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** @type {{snapshot: ?Snapshot, assinatura: string, geracao: number}} */
const estado = { snapshot: null, assinatura: '', geracao: 0 };

/**
 * Valida o que veio do bootstrap/cache: página sem shape mínimo é descartada.
 * @param {*} dados `snapshot.paginas` (resposta da rota `paginas`).
 * @returns {?ConteudoPortal} Conteúdo ou null (módulo falhou no servidor e não há cache).
 */
export const extrairConteudo = (dados) => {
  if (!ehObjeto(dados) || !Array.isArray(dados.paginas)) return null;
  const paginas = dados.paginas.filter((p) => ehObjeto(p)
    && typeof p.titulo === 'string' && p.titulo !== ''
    && typeof p.slug === 'string' && REGEX_SLUG.test(p.slug)
    && (p.tipo === 'conteudo' || p.tipo === 'modulo'))
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : '',
      slug: p.slug,
      titulo: p.titulo,
      icone: typeof p.icone === 'string' ? p.icone : '',
      ordem: Number.isFinite(p.ordem) ? p.ordem : 0,
      tipo: p.tipo,
      modulo: typeof p.modulo === 'string' ? p.modulo : '',
      blocos: Array.isArray(p.blocos) ? p.blocos : [],
    }));
  const tiposAgrupaveis = Array.isArray(dados.tipos_agrupaveis)
    ? dados.tipos_agrupaveis.filter((t) => typeof t === 'string')
    : undefined;
  return { paginas, tiposAgrupaveis };
};

/**
 * Larguras da grade bento no desktop (6 colunas): o primeiro cartão é o "hero" (4×2) com
 * dois cartões de 2 empilhados ao lado; as linhas seguintes alternam 3+3 e 2+2+2 e o último
 * cartão estica para fechar a linha. Função pura.
 * @param {number} total Quantidade de cartões.
 * @returns {Array<Array<string>>} Classes de cada cartão.
 */
export const classesBento = (total) => {
  if (total <= 0) return [];
  if (total === 1) return [['bento__item--6']];
  if (total === 2) return [['bento__item--3'], ['bento__item--3']];
  const ciclo = [3, 3, 2, 2, 2];
  const spans = [4, 2, 2];
  for (let i = 3; i < total; i += 1) spans.push(ciclo[(i - 3) % ciclo.length]);
  const restantes = spans.slice(3);
  const sobra = restantes.reduce((soma, s) => soma + s, 0) % 6;
  if (restantes.length > 0 && sobra !== 0) spans[spans.length - 1] += 6 - sobra;
  return spans.map((s, i) => (i === 0 ? ['bento__item--4', 'bento__item--alto'] : [`bento__item--${s}`]));
};

/**
 * @param {TextoEstado} opcoes Textos do estado.
 * @returns {HTMLElement} Cartão de estado (vazio, erro, em breve).
 */
const criarEstado = ({ titulo, texto, icone = 'info' }) => criarElemento('div', {
  classe: 'cartao estado',
  atributos: { 'data-revelar': '' },
  filhos: [
    criarElemento('span', { classe: 'icone-caixa', filhos: [criarIcone(icone)] }),
    criarElemento('div', {
      classe: 'estado__textos',
      filhos: [
        criarElemento('p', { classe: 'estado__titulo', texto: titulo }),
        criarElemento('p', { classe: 'texto-mudo', texto }),
      ],
    }),
  ],
});

/**
 * @param {Snapshot} snapshot Snapshot.
 * @returns {boolean} true para quem cuida do conteúdo (mensagens com instrução de edição).
 */
const podeEditar = (snapshot) => snapshot.me.permissoes.administrar === true;

/**
 * @param {ConteudoPortal} conteudo Conteúdo.
 * @param {Snapshot} snapshot Snapshot.
 * @returns {HTMLElement} Seções do portal em grade bento.
 */
const criarInicio = (conteudo, snapshot) => {
  if (conteudo.paginas.length === 0) {
    return criarEstado(podeEditar(snapshot)
      ? {
        titulo: 'O portal ainda não tem seções.',
        texto: 'Acrescente uma linha na aba paginas da planilha (com visivel marcado) e use Portal de Cultura › Publicar alterações.',
      }
      : {
        titulo: 'As seções do portal estão sendo preparadas.',
        texto: 'Volte em breve: o conteúdo aparece aqui assim que for publicado.',
      });
  }
  const classes = classesBento(conteudo.paginas.length);
  return criarElemento('section', {
    classe: 'inicio',
    atributos: { 'aria-labelledby': 'inicioTitulo' },
    filhos: [
      criarElemento('h2', { classe: 'sr-only', texto: 'Seções do portal', atributos: { id: 'inicioTitulo' } }),
      criarElemento('div', {
        classe: 'bento',
        filhos: conteudo.paginas.map((pagina, i) => criarElemento('a', {
          classe: ['cartao', 'cartao--interativo', 'spotlight', 'secao-cartao', ...classes[i], i === 0 ? 'cartao--gradiente' : ''],
          atributos: { href: `#/${pagina.slug}`, 'data-revelar': '' },
          filhos: [
            iconeExiste(pagina.icone)
              ? criarElemento('span', { classe: 'icone-caixa', filhos: [criarIcone(pagina.icone)] })
              : null,
            criarElemento('span', { classe: 'secao-cartao__titulo', texto: pagina.titulo }),
          ],
        })),
      }),
    ],
  });
};

/**
 * @param {string} titulo Título da página.
 * @returns {HTMLElement} Cabeçalho com o h1 (alvo de foco na troca de rota).
 */
const criarCabecalho = (titulo) => criarElemento('header', {
  classe: 'pagina__cabecalho',
  filhos: [criarElemento('h1', {
    classe: 'titulo-1 texto-gradiente pagina__titulo',
    texto: titulo,
    atributos: { id: 'tituloPagina', tabindex: '-1' },
  })],
});

/**
 * Página de módulo: o conteúdo interativo entra na Fase 12.
 * @param {PaginaPublica} pagina Página.
 * @param {Snapshot} snapshot Snapshot.
 * @returns {HTMLElement} Estado "em preparação".
 */
const criarModulo = (pagina, snapshot) => criarEstado(pagina.modulo === 'admin' && podeEditar(snapshot)
  ? {
    titulo: 'O editor do portal está em construção.',
    texto: 'Até lá, edite pelas abas paginas e blocos da planilha e use Portal de Cultura › Publicar alterações.',
    icone: 'estrela',
  }
  : {
    titulo: 'Esta seção abre em breve.',
    texto: 'Ela já está no portal e fica disponível na próxima atualização.',
    icone: 'calendario',
  });

/**
 * @param {PaginaPublica} pagina Página.
 * @param {Snapshot} snapshot Snapshot.
 * @returns {HTMLElement} Estado de página sem blocos visíveis.
 */
const criarPaginaVazia = (pagina, snapshot) => criarEstado(podeEditar(snapshot)
  ? {
    titulo: 'Esta página ainda não tem blocos visíveis.',
    texto: `Na aba blocos, acrescente linhas com pagina_id ${pagina.id} e visivel marcado. Linhas com erro de preenchimento aparecem no log do Apps Script.`,
  }
  : {
    titulo: 'O conteúdo desta seção está sendo preparado.',
    texto: 'Volte em breve.',
  });

/**
 * @param {HTMLElement} area Área da página.
 * @param {boolean} focar Move foco e rolagem (troca de rota feita pela pessoa).
 * @returns {void}
 */
const concluirPintura = (area, focar) => {
  revelar(area);
  if (!focar) return;
  globalThis.scrollTo(0, 0);
  reiniciarParallax();
  const titulo = document.getElementById('tituloPagina');
  if (titulo) titulo.focus({ preventScroll: true });
};

/**
 * Pinta a rota. Nunca rejeita: falha vira estado de erro na tela e log.
 * @param {Rota} rota Rota.
 * @param {{focar: boolean}} opcoes Opções.
 * @returns {Promise<void>}
 */
const pintarRota = async (rota, { focar }) => {
  const { snapshot } = estado;
  if (!snapshot) return;
  estado.geracao += 1;
  const { geracao } = estado;
  const area = exigirElemento('areaPagina');
  const conteudo = extrairConteudo(snapshot.paginas);
  const pagina = conteudo && rota.nome === 'pagina' ? conteudo.paginas.find((p) => p.slug === rota.slug) : null;

  definirHeroVisivel(rota.nome === 'inicio');
  marcarPaginaAtual(pagina ? pagina.slug : null);
  document.title = pagina ? `${pagina.titulo} | ${TITULO_DOCUMENTO}` : TITULO_DOCUMENTO;

  try {
    if (!conteudo) {
      area.replaceChildren(criarEstado({
        titulo: 'Não foi possível carregar as seções agora.',
        texto: 'O restante do portal funciona; as seções voltam na próxima atualização.',
        icone: 'alerta',
      }));
    } else if (rota.nome === 'inicio') {
      area.replaceChildren(criarInicio(conteudo, snapshot));
    } else if (!pagina) {
      area.replaceChildren(criarCabecalho('Página não encontrada'), criarEstado({
        titulo: 'Este endereço não corresponde a nenhuma seção disponível para você.',
        texto: 'Use o menu para escolher uma seção ou volte ao início.',
      }));
    } else if (pagina.tipo === 'modulo') {
      area.replaceChildren(criarCabecalho(pagina.titulo), criarModulo(pagina, snapshot));
    } else {
      const blocos = criarElemento('div', {
        classe: 'blocos',
        atributos: { 'aria-busy': 'true' },
        filhos: [criarElemento('div', { classe: 'esqueleto esqueleto--bloco' })],
      });
      area.replaceChildren(criarCabecalho(pagina.titulo), blocos);
      const { fragmento, total } = await renderizarBlocos(pagina.blocos, {
        tiposAgrupaveis: conteudo.tiposAgrupaveis,
      });
      if (geracao !== estado.geracao) return;
      blocos.replaceChildren(total > 0 ? fragmento : criarPaginaVazia(pagina, snapshot));
      blocos.removeAttribute('aria-busy');
    }
  } catch (erro) {
    logErro('pagina_nao_renderizada', erro, { rota: rota.nome });
    if (geracao !== estado.geracao) return;
    area.replaceChildren(criarEstado({
      titulo: 'Esta seção não abriu.',
      texto: 'Recarregue a página. Se continuar, avise a gestão de pessoas.',
      icone: 'erro',
    }));
  }
  concluirPintura(area, focar);
};

/**
 * Liga o roteamento (uma vez, no início da página).
 * @returns {void}
 */
export const iniciarPaginas = () => {
  ouvirRotas((rota) => {
    fecharMenu();
    pintarRota(rota, { focar: true });
  });
};

/**
 * Pinta o portal com um snapshot novo (login, sessão retomada ou `dados:atualizados`).
 * Menu e página só são refeitos se o conteúdo mudou — a vigia de atualização não pisca a
 * tela à toa nem rouba o foco.
 * @param {Snapshot} snapshot Snapshot.
 * @returns {Promise<void>}
 */
export const renderizarPortal = async (snapshot) => {
  const assinatura = JSON.stringify([snapshot.paginas, snapshot.me.papel]);
  const mudou = assinatura !== estado.assinatura || !estado.snapshot;
  estado.snapshot = snapshot;
  if (!mudou) return;
  estado.assinatura = assinatura;
  const conteudo = extrairConteudo(snapshot.paginas);
  renderizarNavegacao(conteudo ? conteudo.paginas : []);
  await pintarRota(rotaAtual(), { focar: false });
};

/**
 * Esquece o estado (logout): o próximo login pinta tudo de novo.
 * @returns {void}
 */
export const limparPortal = () => {
  estado.snapshot = null;
  estado.assinatura = '';
  estado.geracao += 1;
  exigirElemento('navPrincipal').replaceChildren();
  exigirElemento('areaPagina').replaceChildren();
};
