/**
 * @file editor/form-bloco.js
 * Paleta de tipos e painel do bloco, com PRÉ-VISUALIZAÇÃO AO VIVO: a prévia usa o mesmo
 * `renderizarBlocos` do portal, então o que o admin vê antes de salvar é o que o
 * profissional vê depois. O formulário é gerado a partir do contrato que o servidor envia
 * (campos permitidos e obrigatórios de cada tipo).
 */

import { renderizarBlocos } from '../blocos/renderizador.js';
import { logAviso } from '../log.js';
import { criarElemento } from '../ui/dom.js';
import { criarIcone } from '../ui/icones.js';
import {
  ORDEM_CAMPOS, TIPOS_BLOCO, blocoDaPrevia, camposFaltando, infoCampo, midiaDoTexto,
  rotuloEspecialidade,
} from './catalogo.js';
import {
  criarCampoTexto, criarGrupoCaixas, criarInterruptor, criarSelecao,
} from './campos.js';
import { salvarBloco } from './dados.js';
import { ErroFormulario, abrirPainel } from './painel.js';

/** @typedef {import('./dados.js').EstruturaEditor} EstruturaEditor */
/** @typedef {import('./dados.js').BlocoEditor} BlocoEditor */
/** @typedef {import('./dados.js').ResultadoEscrita} ResultadoEscrita */
/** @typedef {import('./catalogo.js').DadosFormularioBloco} DadosFormularioBloco */

const ATRASO_PREVIA_MS = 200;
const URL_MAX = 2000;

/** Como cada mídia reconhecida é descrita para quem edita. */
const DESCRICAO_MIDIA = Object.freeze({
  youtube: 'Vídeo do YouTube reconhecido.',
  drive: 'Arquivo do Google Drive reconhecido.',
  url: 'Imagem de site permitido reconhecida.',
});

/**
 * Paleta: escolhe o tipo do novo bloco. Resolve com o tipo ou null (cancelou).
 * @param {Array<string>} tipos Tipos disponíveis (do servidor), na ordem da paleta.
 * @returns {Promise<?string>} Tipo escolhido.
 */
export const escolherTipoBloco = (tipos) => new Promise((resolve) => {
  let escolhido = null;
  const dialogo = criarElemento('dialog', {
    classe: 'modal modal--largo',
    atributos: { 'aria-labelledby': 'paletaTitulo' },
  });
  const fechar = () => dialogo.close();
  dialogo.append(criarElemento('div', {
    classe: 'cartao modal__cartao',
    filhos: [
      criarElemento('div', {
        classe: 'modal__cabecalho',
        filhos: [
          criarElemento('h2', { classe: 'modal__titulo', texto: 'Que tipo de bloco?', atributos: { id: 'paletaTitulo' } }),
          criarElemento('button', {
            classe: 'botao botao--fantasma botao--icone botao--sm',
            atributos: { type: 'button', 'aria-label': 'Fechar' },
            filhos: [criarIcone('fechar', 'botao__icone')],
            eventos: { click: fechar },
          }),
        ],
      }),
      criarElemento('ul', {
        classe: 'paleta',
        filhos: tipos.filter((t) => TIPOS_BLOCO[t]).map((tipo) => criarElemento('li', {
          filhos: [criarElemento('button', {
            classe: 'paleta__item',
            atributos: { type: 'button', 'data-tipo': tipo },
            eventos: {
              click: () => {
                escolhido = tipo;
                fechar();
              },
            },
            filhos: [
              criarElemento('span', { classe: 'icone-caixa', filhos: [criarIcone(TIPOS_BLOCO[tipo].icone)] }),
              criarElemento('span', {
                classe: 'paleta__textos',
                filhos: [
                  criarElemento('span', { classe: 'paleta__nome', texto: TIPOS_BLOCO[tipo].nome }),
                  criarElemento('span', { classe: 'paleta__descricao', texto: TIPOS_BLOCO[tipo].descricao }),
                ],
              }),
            ],
          })],
        })),
      }),
    ],
  }));
  dialogo.addEventListener('click', (evento) => { if (evento.target === dialogo) fechar(); });
  dialogo.addEventListener('close', () => {
    dialogo.remove();
    resolve(escolhido);
  }, { once: true });
  document.body.append(dialogo);
  dialogo.showModal();
});

/**
 * @typedef {Object} OpcoesEditarBloco
 * @property {?BlocoEditor} bloco Bloco existente (null = novo).
 * @property {string} tipo Tipo (novo) — para existente, o tipo do bloco.
 * @property {string} paginaId Página do bloco.
 * @property {?number} posicao Posição de inserção (novo) ou null.
 * @property {EstruturaEditor} estrutura Estrutura (contratos, limites, páginas, especialidades).
 * @property {function(ResultadoEscrita): void} aoSalvar Recebe o resultado do servidor.
 */

/**
 * Abre o painel do bloco.
 * @param {OpcoesEditarBloco} opcoes Opções.
 * @returns {Promise<boolean>} true se salvou.
 */
export const editarBloco = ({
  bloco, tipo, paginaId, posicao, estrutura, aoSalvar,
}) => {
  const contrato = estrutura.contratos[tipo];
  const info = TIPOS_BLOCO[tipo] || { nome: tipo };
  const novo = bloco === null;

  /** @type {Object<string, import('./campos.js').Campo>} */
  const campos = {};
  ORDEM_CAMPOS.filter((campo) => contrato.permitidos.includes(campo)).forEach((campo) => {
    const detalhe = infoCampo(tipo, campo);
    campos[campo] = criarCampoTexto({
      nome: campo,
      rotulo: detalhe.rotulo,
      ajuda: detalhe.ajuda,
      placeholder: detalhe.placeholder,
      controle: detalhe.controle,
      linhas: tipo === 'markdown' ? 12 : 5,
      obrigatorio: contrato.obrigatorios.includes(campo),
      max: campo === 'midia' || campo === 'link' ? URL_MAX : estrutura.limites[campo],
      valor: novo ? '' : bloco[campo],
    });
  });

  const publico = estrutura.especialidades.length > 0 ? criarGrupoCaixas({
    nome: 'publico',
    legenda: 'Especialidades que veem este bloco',
    itens: estrutura.especialidades.map((e) => ({ valor: e, rotulo: rotuloEspecialidade(e) })),
    marcados: novo ? [] : bloco.publico,
    ajuda: 'Nenhuma marcada = todas. Gestão de pessoas e CEO sempre veem tudo.',
  }) : null;
  const visivel = criarInterruptor({
    rotulo: 'Publicado',
    marcado: novo ? true : bloco.visivel,
    ajuda: 'Desligado, o bloco fica como rascunho e só aparece aqui no editor.',
  });
  const paginasConteudo = estrutura.paginas.filter((p) => p.tipo === 'conteudo' && p.id);
  const pagina = !novo && paginasConteudo.length > 1 ? criarSelecao({
    nome: 'pagina',
    rotulo: 'Página',
    valor: paginaId,
    itens: paginasConteudo.map((p) => ({ valor: p.id, rotulo: p.titulo || p.id })),
    ajuda: 'Trocar de página leva o bloco para o fim da página escolhida.',
  }) : null;

  /** @returns {DadosFormularioBloco} Valores atuais do formulário. */
  const lerDados = () => ({
    tipo,
    ...Object.fromEntries(ORDEM_CAMPOS.map((c) => [c, campos[c] ? campos[c].entrada.value : ''])),
    publico: publico ? publico.valores() : [],
  });

  // ── Retorno imediato da mídia ──
  const atualizarStatusMidia = () => {
    const campo = campos.midia;
    if (!campo) return;
    const valor = campo.entrada.value.trim();
    const midia = midiaDoTexto(valor, contrato.midia);
    campo.status.className = 'campo-status';
    if (!valor) {
      campo.status.replaceChildren();
      return;
    }
    campo.status.classList.add(midia ? 'campo-status--ok' : 'campo-status--erro');
    campo.status.replaceChildren(
      criarIcone(midia ? 'sucesso' : 'alerta', 'campo-status__icone'),
      midia ? DESCRICAO_MIDIA[midia.tipo] : 'Link não reconhecido. Confira se copiou o endereço completo.',
    );
  };

  // ── Prévia ao vivo ──
  const areaPrevia = criarElemento('div', { classe: 'editor-previa__conteudo blocos', atributos: { 'aria-live': 'off' } });
  let geracaoPrevia = 0;
  let temporizador = null;
  const desenharPrevia = async () => {
    geracaoPrevia += 1;
    const minhaGeracao = geracaoPrevia;
    const previa = blocoDaPrevia(lerDados(), contrato, novo ? 'previa' : bloco.id);
    try {
      const { fragmento, total } = await renderizarBlocos([previa], {
        tiposAgrupaveis: estrutura.tiposAgrupaveis,
      });
      if (minhaGeracao !== geracaoPrevia) return;
      areaPrevia.replaceChildren(total > 0 ? fragmento : criarElemento('p', {
        classe: 'editor-previa__vazia texto-mudo texto-pequeno',
        texto: 'A prévia aparece quando os campos obrigatórios estiverem preenchidos.',
      }));
    } catch (erro) {
      logAviso('previa_falhou', { tipo, motivo: erro instanceof Error ? erro.name : 'desconhecido' });
    }
  };
  const agendarPrevia = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(desenharPrevia, ATRASO_PREVIA_MS);
  };

  const formulario = criarElemento('div', {
    classe: 'editor-bloco-form',
    filhos: [
      criarElemento('div', {
        classe: 'painel__campos',
        filhos: [
          ...Object.values(campos).map((c) => c.elemento),
          publico ? publico.elemento : null,
          pagina ? pagina.elemento : null,
          visivel.elemento,
        ],
      }),
      criarElemento('aside', {
        classe: 'editor-previa',
        atributos: { 'aria-label': 'Prévia do bloco' },
        filhos: [
          criarElemento('p', { classe: 'rotulo editor-previa__rotulo', texto: 'Prévia' }),
          areaPrevia,
        ],
      }),
    ],
  });
  formulario.addEventListener('input', () => {
    atualizarStatusMidia();
    agendarPrevia();
  });
  formulario.addEventListener('change', agendarPrevia);
  atualizarStatusMidia();
  desenharPrevia();

  const validar = (dados) => {
    Object.values(campos).forEach((c) => c.definirErro(''));
    const faltando = camposFaltando(dados, contrato);
    faltando.forEach((campo) => campos[campo].definirErro('Preencha este campo.'));
    const midiaRuim = campos.midia && dados.midia.trim()
      && !midiaDoTexto(dados.midia, contrato.midia);
    if (midiaRuim) campos.midia.definirErro('Link não reconhecido para este tipo de bloco.');
    const primeiro = [...faltando, midiaRuim ? 'midia' : null].find(Boolean);
    if (primeiro) {
      campos[primeiro].entrada.focus();
      throw new ErroFormulario('Revise os campos destacados.');
    }
  };

  return abrirPainel({
    titulo: novo ? `Novo bloco: ${info.nome}` : `Editar bloco: ${info.nome}`,
    descricao: novo ? info.descricao : `Linha ${bloco.linha} da aba blocos.`,
    corpo: formulario,
    tamanho: 'largo',
    rotuloSalvar: novo ? 'Adicionar bloco' : 'Salvar',
    aoSalvar: async () => {
      const dados = lerDados();
      validar(dados);
      const resultado = await salvarBloco({
        id: novo ? undefined : bloco.id,
        pagina_id: pagina ? pagina.entrada.value : paginaId,
        tipo,
        titulo: dados.titulo,
        subtitulo: dados.subtitulo,
        texto: dados.texto,
        midia: dados.midia,
        link: dados.link,
        versao: dados.versao,
        vigente_desde: dados.vigente_desde,
        publico: dados.publico,
        visivel: visivel.marcado(),
        posicao: novo && Number.isInteger(posicao) ? posicao : undefined,
      });
      clearTimeout(temporizador);
      aoSalvar(resultado);
    },
  });
};
