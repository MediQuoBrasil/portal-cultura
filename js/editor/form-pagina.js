/**
 * @file editor/form-pagina.js
 * Painel "Nova página" / "Configurar página": título, ícone, tipo (conteúdo ou módulo),
 * quem vê, visibilidade no menu e endereço. Validação local para retorno imediato; quem
 * decide é o servidor (EditorEscrita.gs → validarEntradaPagina).
 */

import { criarElemento } from '../ui/dom.js';
import { ICONES_PAGINA } from '../ui/icones.js';
import {
  NOMES_MODULO, OPCOES_PUBLICO_PAGINA, valorPublicoPagina,
} from './catalogo.js';
import {
  criarCampoTexto, criarGrupoRadio, criarInterruptor, criarSelecao,
} from './campos.js';
import { salvarPagina } from './dados.js';
import { ErroFormulario, abrirPainel } from './painel.js';

/** @typedef {import('./dados.js').EstruturaEditor} EstruturaEditor */
/** @typedef {import('./dados.js').PaginaEditor} PaginaEditor */
/** @typedef {import('./dados.js').ResultadoEscrita} ResultadoEscrita */

const REGEX_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** Rótulo legível de cada ícone de página (acessível: o ícone sozinho não diz nada). */
const ROTULOS_ICONE = Object.freeze({
  casa: 'Casa',
  livro: 'Livro',
  pessoas: 'Pessoas',
  estrela: 'Estrela',
  coracao: 'Coração',
  calendario: 'Calendário',
  mensagem: 'Mensagem',
  escudo: 'Escudo',
  grafico: 'Gráfico',
  video: 'Vídeo',
  documento: 'Documento',
});

/**
 * Abre o painel da página.
 * @param {Object} opcoes Opções.
 * @param {?PaginaEditor} opcoes.pagina Página existente (null = nova).
 * @param {EstruturaEditor} opcoes.estrutura Estrutura atual (módulos, limites).
 * @param {function(ResultadoEscrita): void} opcoes.aoSalvar Recebe o resultado do servidor.
 * @returns {Promise<boolean>} true se salvou.
 */
const editarPagina = ({ pagina, estrutura, aoSalvar }) => {
  const nova = pagina === null;
  const titulo = criarCampoTexto({
    nome: 'titulo',
    rotulo: 'Nome no menu',
    valor: nova ? '' : pagina.titulo,
    obrigatorio: true,
    max: estrutura.tituloPaginaMax,
    ajuda: 'Curto e direto: é o texto do item no menu e do cartão no início.',
  });
  const icone = criarGrupoRadio({
    nome: 'icone',
    legenda: 'Ícone',
    estilo: 'icones',
    valor: nova ? 'estrela' : pagina.icone,
    itens: [{ valor: '', rotulo: 'Sem ícone', icone: 'fechar' },
      ...ICONES_PAGINA.map((nome) => ({
        valor: nome, rotulo: ROTULOS_ICONE[nome] || nome, icone: nome,
      }))],
  });
  const tipo = criarGrupoRadio({
    nome: 'tipo',
    legenda: 'O que a página mostra',
    valor: nova ? 'conteudo' : pagina.tipo,
    itens: [
      { valor: 'conteudo', rotulo: 'Conteúdo: textos, cards, pessoas, vídeos e documentos que você monta' },
      { valor: 'modulo', rotulo: 'Módulo: um recurso pronto do portal (feedback, enquetes…)' },
    ],
  });
  const modulo = criarSelecao({
    nome: 'modulo',
    rotulo: 'Módulo',
    valor: nova ? estrutura.modulos[0] : pagina.modulo,
    itens: estrutura.modulos.map((m) => ({ valor: m, rotulo: NOMES_MODULO[m] || m })),
  });
  const publico = criarGrupoRadio({
    nome: 'publico',
    legenda: 'Quem vê esta página',
    valor: nova ? 'todos' : valorPublicoPagina(pagina.papeis),
    itens: OPCOES_PUBLICO_PAGINA.map((o) => ({ valor: o.valor, rotulo: o.rotulo })),
    ajuda: 'O servidor aplica esta regra: quem não pode ver nem recebe a página.',
  });
  const visivel = criarInterruptor({
    rotulo: 'Visível no menu',
    marcado: nova ? true : pagina.visivel,
    ajuda: 'Desligado, a página fica como rascunho e só aparece aqui no editor.',
  });
  const slug = criarCampoTexto({
    nome: 'slug',
    rotulo: 'Endereço da página',
    valor: nova ? '' : pagina.slug,
    max: 60,
    placeholder: nova ? 'Gerado a partir do nome' : '',
    ajuda: 'Aparece no link (…/#/endereco). Use letras minúsculas, números e hífen. Mudar o endereço quebra links já compartilhados.',
  });

  const avisoBlocos = !nova && pagina.total_blocos > 0 ? criarElemento('p', {
    classe: 'campo-status campo-status--erro',
    texto: `Esta página tem ${pagina.total_blocos} ${pagina.total_blocos === 1 ? 'bloco' : 'blocos'}. Como módulo, eles deixam de aparecer (continuam guardados na planilha).`,
  }) : null;
  const sincronizarModulo = () => {
    const ehModulo = tipo.valor() === 'modulo';
    modulo.elemento.toggleAttribute('hidden', !ehModulo);
    if (avisoBlocos) avisoBlocos.toggleAttribute('hidden', !ehModulo);
  };
  tipo.elemento.addEventListener('change', sincronizarModulo);
  sincronizarModulo();

  const corpo = criarElemento('div', {
    classe: 'painel__campos',
    filhos: [
      titulo.elemento,
      icone.elemento,
      tipo.elemento,
      modulo.elemento,
      avisoBlocos,
      publico.elemento,
      visivel.elemento,
      criarElemento('details', {
        classe: 'painel__avancado',
        atributos: { open: !nova && pagina.problema === 'slug_invalido' },
        filhos: [criarElemento('summary', { texto: 'Avançado' }), slug.elemento],
      }),
    ],
  });

  const validar = () => {
    const nome = titulo.entrada.value.trim();
    const endereco = slug.entrada.value.trim();
    titulo.definirErro(nome ? '' : 'Dê um nome à página.');
    let erroSlug = '';
    if (endereco && !REGEX_SLUG.test(endereco)) erroSlug = 'Use só letras minúsculas, números e hífen (sem começar com hífen).';
    else if (estrutura.slugsReservados.includes(endereco)) erroSlug = 'Este endereço é reservado pelo portal.';
    slug.definirErro(erroSlug);
    if (erroSlug) corpo.querySelector('.painel__avancado').open = true;
    if (!nome || erroSlug) throw new ErroFormulario('Revise os campos destacados.');
    return { nome, endereco };
  };

  return abrirPainel({
    titulo: nova ? 'Nova página' : 'Configurar página',
    descricao: nova ? 'A página entra no fim do menu. Depois você acrescenta o conteúdo.' : `Linha ${pagina.linha} da aba paginas.`,
    corpo,
    rotuloSalvar: nova ? 'Criar página' : 'Salvar',
    aoSalvar: async () => {
      const { nome, endereco } = validar();
      const opcaoPublico = OPCOES_PUBLICO_PAGINA.find((o) => o.valor === publico.valor())
        || OPCOES_PUBLICO_PAGINA[0];
      const tipoEscolhido = tipo.valor() === 'modulo' ? 'modulo' : 'conteudo';
      const resultado = await salvarPagina({
        id: nova ? undefined : pagina.id,
        titulo: nome,
        slug: endereco || undefined,
        icone: icone.valor(),
        tipo: tipoEscolhido,
        modulo: tipoEscolhido === 'modulo' ? modulo.entrada.value : undefined,
        papeis: opcaoPublico.papeis,
        visivel: visivel.marcado(),
      });
      aoSalvar(resultado);
    },
  });
};

export default editarPagina;
