/**
 * @file editor/editor.js
 * Editor "estilo Wix" dentro do portal (só admin; o servidor decide cada ação):
 *
 *   #/editar        → Menu do portal (páginas: criar, ordenar, mostrar/ocultar, excluir)
 *   #/editar/<id>   → Conteúdo da página (blocos: adicionar, editar, ordenar, publicar)
 *
 * Fluxo de dados: a estrutura vem de `editor_estrutura`; cada escrita devolve a estrutura
 * atualizada e o editor redesenha com ela. Depois de gravar, o portal público se atualiza
 * pelo mecanismo de sempre (`check_update` → bootstrap), agendado para logo após a última
 * alteração.
 *
 * Reordenar é otimista: a lista muda na hora e a nova ordem vai ao servidor alguns
 * instantes depois do último clique (vários cliques = uma escrita). Se o servidor recusar,
 * o editor recarrega a estrutura e avisa.
 */

import { ErroApi } from '../api.js';
import { logErro, logInfo } from '../log.js';
import { hashDaRota } from '../rotas.js';
import { verificarAgora } from '../sincronia.js';
import { criarElemento } from '../ui/dom.js';
import { confirmar } from '../ui/modal.js';
import mostrarToast from '../ui/toast.js';
import {
  carregarEstrutura, excluirBloco, excluirPagina, reordenar, salvarBloco, salvarPagina,
} from './dados.js';
import { criarEstadoEditor } from './componentes.js';
import { editarBloco, escolherTipoBloco } from './form-bloco.js';
import editarPagina from './form-pagina.js';
import { fecharPainelAberto } from './painel.js';
import criarVistaMenu from './vista-menu.js';
import criarVistaPagina, { blocosDaPagina } from './vista-pagina.js';

/** @typedef {import('./dados.js').EstruturaEditor} EstruturaEditor */
/** @typedef {import('./dados.js').ResultadoEscrita} ResultadoEscrita */
/** @typedef {{nome: 'editor', paginaId: ?string}} RotaEditor */

/** Espera após o último clique de mover antes de gravar a nova ordem. */
const ATRASO_ORDEM_MS = 900;
/** Espera após a última gravação antes de atualizar o portal público. */
const ATRASO_SINCRONIA_MS = 1500;

/**
 * @typedef {Object} OrdemPendente
 * @property {'paginas'|'blocos'} escopo
 * @property {string} paginaId
 * @property {Array<string>} ids
 * @property {ReturnType<typeof setTimeout>} temporizador
 */

/**
 * @type {{estrutura: ?EstruturaEditor, rota: ?RotaEditor, area: ?HTMLElement, ativo: boolean,
 *   geracao: number, modo: 'editar'|'previa', ordem: ?OrdemPendente,
 *   sincronia: ?ReturnType<typeof setTimeout>}}
 */
const estado = {
  estrutura: null, rota: null, area: null, ativo: false, geracao: 0, modo: 'editar', ordem: null, sincronia: null,
};

// ─── Desenho ───────────────────────────────────────────────────────────────────────────

/**
 * Devolve o foco ao mesmo controle depois de redesenhar (ex.: seta de mover).
 * @param {?string} chave `data-foco` que tinha o foco.
 * @returns {void}
 */
const restaurarFoco = (chave) => {
  if (!chave || !estado.area) return;
  const buscar = (k) => Array.from(estado.area.querySelectorAll('[data-foco]'))
    .find((el) => el.getAttribute('data-foco') === k && !el.disabled);
  // A seta que tinha o foco ficou desativada (item chegou ao topo/fim): foca a oposta.
  const [acao, id] = chave.split(':');
  const oposta = { subir: 'descer', descer: 'subir' }[acao];
  const alvo = buscar(chave) || (oposta && buscar(`${oposta}:${id}`));
  if (alvo) {
    alvo.focus({ preventScroll: true });
    return;
  }
  // O controle sumiu (item excluído): o foco não pode cair no <body>; vai para o título.
  const titulo = document.getElementById('tituloPagina');
  const focoPerdido = !estado.area.contains(document.activeElement);
  if (titulo && focoPerdido) titulo.focus({ preventScroll: true });
};

/** @returns {?string} `data-foco` do controle com foco agora. */
const chaveComFoco = () => {
  const ativo = document.activeElement;
  return ativo ? ativo.getAttribute('data-foco') : null;
};

/** @type {Object} Ações entregues às vistas (definidas abaixo). */
const acoes = {};

/**
 * Redesenha a vista atual a partir de `estado.estrutura`.
 * @param {{focar?: boolean}} [opcoes] `focar` move o foco para o título (troca de vista).
 * @returns {void}
 */
const desenhar = ({ focar = false } = {}) => {
  const { area, estrutura, rota } = estado;
  if (!area || !estrutura || !rota || !estado.ativo) return;
  estado.geracao += 1;
  const { geracao } = estado;
  const chaveFoco = focar ? null : chaveComFoco();
  const pagina = rota.paginaId ? estrutura.paginas.find((p) => p.id === rota.paginaId) : null;

  if (rota.paginaId && !pagina) {
    area.replaceChildren(criarEstadoEditor({
      titulo: 'Esta página não existe mais.',
      texto: 'Ela pode ter sido excluída por outra pessoa ou pela planilha.',
      acao: criarElemento('a', { classe: 'botao botao--secundario botao--sm', texto: 'Voltar ao menu do portal', atributos: { href: hashDaRota({ nome: 'editor', paginaId: null }) } }),
    }));
  } else if (pagina) {
    area.replaceChildren(criarVistaPagina({
      estrutura, pagina, modo: estado.modo, acoes, vigente: () => geracao === estado.geracao,
    }));
  } else {
    area.replaceChildren(criarVistaMenu(estrutura, acoes));
  }
  if (focar) {
    const titulo = document.getElementById('tituloPagina');
    if (titulo) titulo.focus({ preventScroll: true });
  } else {
    restaurarFoco(chaveFoco);
  }
};

// ─── Sincronia com o servidor e com o portal público ───────────────────────────────────

/** Atualiza o portal público (menu, páginas) logo depois da última gravação. */
const agendarSincronia = () => {
  clearTimeout(estado.sincronia);
  estado.sincronia = setTimeout(() => { verificarAgora({ forcar: true }); }, ATRASO_SINCRONIA_MS);
};

/**
 * Recarrega a estrutura do servidor e redesenha.
 * @returns {Promise<void>}
 */
const recarregar = async () => {
  try {
    estado.estrutura = await carregarEstrutura();
    desenhar();
  } catch (erro) {
    logErro('editor_recarga_falhou', erro);
  }
};

/**
 * Aplica o resultado de uma escrita.
 * @param {ResultadoEscrita} resultado Resultado.
 * @param {string} [mensagem] Toast de sucesso.
 * @returns {void}
 */
const aplicarResultado = (resultado, mensagem) => {
  estado.estrutura = resultado.estrutura;
  desenhar();
  if (mensagem) mostrarToast(mensagem, { tipo: 'sucesso' });
  agendarSincronia();
};

/**
 * Mostra a falha e, quando a estrutura na tela pode estar velha, recarrega do servidor.
 * @param {*} erro Erro.
 * @param {string} contexto Nome da ação (log).
 * @param {{recarregarSempre?: boolean}} [opcoes] `recarregarSempre` após mudança otimista.
 * @returns {void}
 */
const tratarFalha = (erro, contexto, { recarregarSempre = false } = {}) => {
  const mensagem = erro instanceof ErroApi ? erro.message : 'Não foi possível concluir agora. Tente de novo em instantes.';
  if (!(erro instanceof ErroApi)) logErro(`editor_${contexto}_falhou`, erro);
  mostrarToast(mensagem, { tipo: 'erro', duracaoMs: 7000 });
  const velha = erro instanceof ErroApi && ['CONFLITO', 'NAO_ENCONTRADO'].includes(erro.codigo);
  if (recarregarSempre || velha) recarregar();
};

/**
 * Envia a reordenação pendente (se houver) e espera terminar. Chamado antes de qualquer
 * outra escrita e ao sair do editor, para nenhuma ordem se perder.
 * @returns {Promise<void>}
 */
const enviarOrdemPendente = async () => {
  const pendente = estado.ordem;
  if (!pendente) return;
  clearTimeout(pendente.temporizador);
  estado.ordem = null;
  try {
    const resultado = await reordenar(pendente.escopo, pendente.ids, pendente.paginaId);
    if (!estado.ordem) aplicarResultado(resultado);
    logInfo('editor_ordem_gravada', { escopo: pendente.escopo, itens: pendente.ids.length });
  } catch (erro) {
    tratarFalha(erro, 'reordenar', { recarregarSempre: true });
  }
};

/**
 * Agenda a gravação da nova ordem (debounce). Mudar de escopo envia a anterior na hora.
 * @param {'paginas'|'blocos'} escopo Escopo.
 * @param {Array<string>} ids Nova ordem.
 * @param {string} paginaId Página (blocos).
 * @returns {void}
 */
const agendarOrdem = (escopo, ids, paginaId) => {
  const anterior = estado.ordem;
  const outroEscopo = anterior && (anterior.escopo !== escopo || anterior.paginaId !== paginaId);
  if (outroEscopo) enviarOrdemPendente();
  if (estado.ordem) clearTimeout(estado.ordem.temporizador);
  estado.ordem = {
    escopo, ids, paginaId, temporizador: setTimeout(enviarOrdemPendente, ATRASO_ORDEM_MS),
  };
};

/**
 * Troca dois vizinhos de lugar (função pura).
 * @template T
 * @param {Array<T>} lista Lista.
 * @param {number} indice Item.
 * @param {number} delta -1 (subir) ou 1 (descer).
 * @returns {?Array<T>} Nova lista ou null se não dá para mover.
 */
export const moverNaLista = (lista, indice, delta) => {
  const destino = indice + delta;
  if (indice < 0 || destino < 0 || destino >= lista.length) return null;
  const copia = lista.slice();
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
};

/**
 * Executa uma escrita garantindo que a ordem pendente foi antes.
 * @param {string} contexto Nome (log).
 * @param {function(): Promise<ResultadoEscrita>} escrita Escrita.
 * @param {string} mensagem Toast de sucesso.
 * @returns {Promise<void>}
 */
const executar = async (contexto, escrita, mensagem) => {
  await enviarOrdemPendente();
  try {
    aplicarResultado(await escrita(), mensagem);
  } catch (erro) {
    tratarFalha(erro, contexto);
  }
};

// ─── Ações das vistas ──────────────────────────────────────────────────────────────────

/**
 * @param {string} id Página.
 * @returns {?import('./dados.js').PaginaEditor} Página.
 */
const paginaPorId = (id) => estado.estrutura.paginas.find((p) => p.id === id) || null;

/**
 * @param {string} id Bloco.
 * @returns {?import('./dados.js').BlocoEditor} Bloco.
 */
const blocoPorId = (id) => estado.estrutura.blocos.find((b) => b.id === id) || null;

acoes.novaPagina = async () => {
  await enviarOrdemPendente();
  await editarPagina({
    pagina: null,
    estrutura: estado.estrutura,
    aoSalvar: (resultado) => {
      aplicarResultado(resultado, 'Página criada. Ela já está no menu do portal.');
      const nova = paginaPorId(resultado.id);
      if (nova && nova.tipo === 'conteudo') globalThis.location.hash = hashDaRota({ nome: 'editor', paginaId: nova.id });
    },
  });
};

acoes.configurarPagina = async (id) => {
  const pagina = paginaPorId(id);
  if (!pagina) return;
  const chave = chaveComFoco();
  await enviarOrdemPendente();
  await editarPagina({
    pagina,
    estrutura: estado.estrutura,
    aoSalvar: (resultado) => aplicarResultado(resultado, 'Página salva.'),
  });
  // O <dialog> devolve o foco ao botão que o abriu — que foi recriado ao redesenhar.
  restaurarFoco(chave);
};

acoes.alternarPagina = (id) => {
  const p = paginaPorId(id);
  if (!p) return;
  executar('alternar_pagina', () => salvarPagina({
    id: p.id, titulo: p.titulo, slug: p.slug, icone: p.icone, tipo: p.tipo, modulo: p.tipo === 'modulo' ? p.modulo : undefined, papeis: p.papeis, visivel: !p.visivel,
  }), p.visivel ? 'Página ocultada do menu (rascunho).' : 'Página publicada no menu.');
};

acoes.excluirPagina = async (id) => {
  const p = paginaPorId(id);
  if (!p) return;
  const total = blocosDaPagina(estado.estrutura, id).length;
  const ok = await confirmar({
    titulo: `Excluir "${p.titulo}"?`,
    texto: total > 0
      ? `A página e os ${total} ${total === 1 ? 'bloco dela serão apagados' : 'blocos dela serão apagados'}. Para recuperar depois, só pelo histórico de versões da planilha.`
      : 'A página sai do menu e da planilha. Para recuperar depois, só pelo histórico de versões da planilha.',
    rotuloConfirmar: 'Excluir página',
    perigo: true,
  });
  if (!ok) return;
  await executar('excluir_pagina', () => excluirPagina(id), 'Página excluída.');
  if (estado.rota && estado.rota.paginaId === id) globalThis.location.hash = hashDaRota({ nome: 'editor', paginaId: null });
};

acoes.moverPagina = (id, delta) => {
  const comId = estado.estrutura.paginas.filter((p) => p.id !== '' && p.problema !== 'id_invalido');
  const nova = moverNaLista(comId, comId.findIndex((p) => p.id === id), delta);
  if (!nova) return;
  estado.estrutura = {
    ...estado.estrutura,
    paginas: [...nova, ...estado.estrutura.paginas.filter((p) => !comId.includes(p))],
  };
  desenhar();
  agendarOrdem('paginas', nova.map((p) => p.id), '');
};

acoes.novoBloco = async (paginaId, posicao) => {
  const chave = chaveComFoco();
  await enviarOrdemPendente();
  const tipo = await escolherTipoBloco(Object.keys(estado.estrutura.contratos));
  if (!tipo) return;
  let novoId = '';
  await editarBloco({
    bloco: null,
    tipo,
    paginaId,
    posicao,
    estrutura: estado.estrutura,
    aoSalvar: (resultado) => {
      novoId = resultado.id;
      aplicarResultado(resultado, 'Bloco adicionado.');
    },
  });
  restaurarFoco(novoId ? `editar:${novoId}` : chave);
};

acoes.editarBloco = async (id) => {
  const bloco = blocoPorId(id);
  if (!bloco || !estado.estrutura.contratos[bloco.tipo]) return;
  const chave = chaveComFoco();
  await enviarOrdemPendente();
  await editarBloco({
    bloco,
    tipo: bloco.tipo,
    paginaId: bloco.pagina_id,
    posicao: null,
    estrutura: estado.estrutura,
    aoSalvar: (resultado) => aplicarResultado(resultado, 'Bloco salvo.'),
  });
  restaurarFoco(chave);
};

acoes.alternarBloco = (id) => {
  const b = blocoPorId(id);
  if (!b) return;
  executar('alternar_bloco', () => salvarBloco({
    id: b.id,
    pagina_id: b.pagina_id,
    tipo: b.tipo,
    titulo: b.titulo,
    subtitulo: b.subtitulo,
    texto: b.texto,
    midia: b.midia,
    link: b.link,
    versao: b.versao,
    vigente_desde: b.vigente_desde,
    publico: b.publico,
    visivel: !b.visivel,
  }), b.visivel ? 'Bloco ocultado (rascunho).' : 'Bloco publicado.');
};

acoes.excluirBloco = async (id) => {
  const b = blocoPorId(id);
  if (!b) return;
  const ok = await confirmar({
    titulo: 'Excluir este bloco?',
    texto: 'Ele sai do portal e da planilha. Se quiser só tirar do ar, use o olho (rascunho).',
    rotuloConfirmar: 'Excluir bloco',
    perigo: true,
  });
  if (ok) await executar('excluir_bloco', () => excluirBloco(id), 'Bloco excluído.');
};

acoes.moverBloco = (id, delta) => {
  const bloco = blocoPorId(id);
  if (!bloco) return;
  const daPagina = blocosDaPagina(estado.estrutura, bloco.pagina_id);
  const nova = moverNaLista(daPagina, daPagina.indexOf(bloco), delta);
  if (!nova) return;
  estado.estrutura = {
    ...estado.estrutura,
    blocos: [...estado.estrutura.blocos.filter((b) => b.pagina_id !== bloco.pagina_id), ...nova],
  };
  desenhar();
  agendarOrdem('blocos', nova.map((b) => b.id), bloco.pagina_id);
};

acoes.alternarModo = (modo) => {
  if (estado.modo === modo) return;
  estado.modo = modo;
  desenhar();
};

// ─── Ciclo de vida (chamado por paginas.js) ────────────────────────────────────────────

/**
 * Abre (ou atualiza) o editor na área de página.
 * @param {HTMLElement} area Área principal.
 * @param {RotaEditor} rota Rota.
 * @returns {Promise<void>}
 */
export const abrirEditor = async (area, rota) => {
  const trocouDePagina = !estado.rota || estado.rota.paginaId !== rota.paginaId;
  estado.area = area;
  estado.rota = rota;
  if (trocouDePagina) estado.modo = 'editar';
  if (estado.ativo && estado.estrutura) {
    desenhar({ focar: true });
    return;
  }
  estado.ativo = true;
  estado.geracao += 1;
  const { geracao } = estado;
  area.replaceChildren(criarEstadoEditor({ titulo: 'Abrindo o editor…', carregando: true }));
  try {
    const estrutura = await carregarEstrutura();
    if (geracao !== estado.geracao || !estado.ativo) return;
    estado.estrutura = estrutura;
    desenhar({ focar: true });
    logInfo('editor_aberto', { paginas: estrutura.paginas.length, blocos: estrutura.blocos.length });
  } catch (erro) {
    if (geracao !== estado.geracao || !estado.ativo) return;
    logErro('editor_abertura_falhou', erro);
    const proibido = erro instanceof ErroApi && erro.codigo === 'PROIBIDO';
    area.replaceChildren(criarEstadoEditor({
      titulo: proibido ? 'Sua conta não pode editar o portal.' : 'Não foi possível abrir o editor agora.',
      texto: proibido ? 'O editor é da gestão de pessoas.' : 'Verifique a conexão e tente de novo.',
      icone: 'alerta',
      acao: proibido ? null : criarElemento('button', {
        classe: 'botao botao--secundario botao--sm',
        texto: 'Tentar de novo',
        atributos: { type: 'button' },
        eventos: { click: () => { estado.ativo = false; abrirEditor(area, rota); } },
      }),
    }));
  }
};

/**
 * Fecha o editor (saiu da rota ou encerrou a sessão): grava a ordem pendente, fecha o
 * painel aberto e esquece a estrutura (a próxima abertura relê do servidor).
 * @returns {void}
 */
export const fecharEditor = () => {
  if (!estado.ativo) return;
  enviarOrdemPendente();
  fecharPainelAberto();
  estado.ativo = false;
  estado.estrutura = null;
  estado.rota = null;
  estado.geracao += 1;
};

/** @returns {boolean} true enquanto o editor está na tela. */
export const editorAtivo = () => estado.ativo;
