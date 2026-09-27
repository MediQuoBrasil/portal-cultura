/**
 * @file editor/catalogo.js
 * Vocabulário do editor, sem DOM (funções puras, testáveis em Node):
 * - o que cada tipo de bloco é, dito para quem edita (paleta);
 * - rótulo e ajuda de cada campo por tipo;
 * - conversão do formulário em bloco de prévia, com a MESMA normalização de mídia do
 *   servidor (Blocos.gs → normalizarMidia).
 *
 * Quais campos um tipo usa e quais são obrigatórios NÃO vive aqui: vem do servidor
 * (`contratos` da rota `editor_estrutura`). Este arquivo só dá nome e explicação.
 */

import { HOSTS_IMAGEM } from '../config.js';

/** @typedef {import('../blocos/renderizador.js').BlocoPublico} BlocoPublico */
/** @typedef {import('../blocos/midia.js').Midia} Midia */

/**
 * @typedef {'drive'|'youtube'|'imagem'|null} EsperaMidia
 */

/**
 * @typedef {Object} InfoTipoBloco
 * @property {string} nome Nome curto na paleta.
 * @property {string} descricao Para que serve, em uma frase.
 * @property {string} icone Ícone (ui/icones.js).
 */

/** @type {Readonly<Object<string, InfoTipoBloco>>} */
export const TIPOS_BLOCO = Object.freeze({
  markdown: { nome: 'Texto', descricao: 'Parágrafos, listas e subtítulos. Bom para comunicação e boas práticas.', icone: 'texto' },
  destaque: { nome: 'Destaque', descricao: 'Uma frase forte em evidência: missão, visão ou um aviso.', icone: 'estrela' },
  card: { nome: 'Card', descricao: 'Cartão com título, texto e imagem. Vários seguidos viram uma grade.', icone: 'cartao' },
  pessoa: { nome: 'Pessoa', descricao: 'Foto, nome, cargo e história. Ideal para sócios e fundadores.', icone: 'usuario' },
  timeline: { nome: 'Marco da história', descricao: 'Um ano ou data com o que aconteceu. Vários seguidos viram uma linha do tempo.', icone: 'linha-tempo' },
  documento: { nome: 'Documento', descricao: 'PDF ou arquivo do Drive, com versão e data de vigência. Para protocolos.', icone: 'documento' },
  video: { nome: 'Vídeo', descricao: 'Vídeo do YouTube que abre num player dentro do portal.', icone: 'video' },
  imagem: { nome: 'Imagem', descricao: 'Banner ou arte em largura total.', icone: 'imagem' },
  link: { nome: 'Botão de link', descricao: 'Botão que abre um site externo permitido.', icone: 'externo' },
});

/** Ordem dos campos no formulário. */
export const ORDEM_CAMPOS = Object.freeze(['titulo', 'subtitulo', 'texto', 'midia', 'link', 'versao', 'vigente_desde']);

/**
 * @typedef {Object} InfoCampo
 * @property {string} rotulo
 * @property {string} [ajuda]
 * @property {'linha'|'texto-longo'|'data'} [controle='linha']
 * @property {string} [placeholder]
 */

/** Rótulos padrão (valem quando o tipo não define um próprio). */
const CAMPOS_PADRAO = Object.freeze({
  titulo: { rotulo: 'Título' },
  subtitulo: { rotulo: 'Subtítulo' },
  texto: { rotulo: 'Texto', controle: 'texto-longo' },
  midia: { rotulo: 'Imagem', ajuda: 'Cole o link de compartilhamento do Google Drive (arquivo com acesso "qualquer pessoa com o link").', placeholder: 'https://drive.google.com/file/d/…' },
  link: { rotulo: 'Link', ajuda: 'Endereço completo com https:// (ou mailto: para e-mail). Só sites permitidos na configuração do portal.', placeholder: 'https://' },
  versao: { rotulo: 'Versão', placeholder: 'Ex.: 2.1' },
  vigente_desde: { rotulo: 'Vigente desde', controle: 'data' },
});

/** Ajustes de rótulo por tipo (o mesmo campo significa coisas diferentes em cada bloco). */
const CAMPOS_POR_TIPO = Object.freeze({
  markdown: {
    titulo: { rotulo: 'Título da seção', ajuda: 'Opcional.' },
    texto: {
      rotulo: 'Texto',
      controle: 'texto-longo',
      ajuda: 'Aceita Markdown: **negrito**, _itálico_, listas com "- ", subtítulos com "## " e links. Imagens entram pelo bloco Imagem.',
    },
  },
  destaque: {
    titulo: { rotulo: 'Rótulo', ajuda: 'Opcional. Ex.: Missão.' },
    texto: { rotulo: 'Frase em destaque', controle: 'texto-longo' },
  },
  card: {
    subtitulo: { rotulo: 'Subtítulo', ajuda: 'Opcional.' },
    texto: { rotulo: 'Descrição', controle: 'texto-longo', ajuda: 'Opcional. Texto simples.' },
    midia: { ...CAMPOS_PADRAO.midia, rotulo: 'Imagem (opcional)' },
    link: { ...CAMPOS_PADRAO.link, rotulo: 'Link do botão "Abrir" (opcional)' },
  },
  pessoa: {
    titulo: { rotulo: 'Nome' },
    subtitulo: { rotulo: 'Cargo', ajuda: 'Opcional. Ex.: CEO e cofundador.' },
    texto: {
      rotulo: 'História', controle: 'texto-longo', ajuda: 'Opcional. Aceita Markdown. Com história, o cartão abre um perfil ao clicar.',
    },
    midia: { ...CAMPOS_PADRAO.midia, rotulo: 'Foto (opcional)' },
  },
  timeline: {
    titulo: { rotulo: 'Ano ou data', placeholder: 'Ex.: 2019' },
    texto: { rotulo: 'O que aconteceu', controle: 'texto-longo' },
  },
  documento: {
    titulo: { rotulo: 'Nome do documento' },
    texto: { rotulo: 'Resumo', controle: 'texto-longo', ajuda: 'Opcional.' },
    midia: {
      rotulo: 'Arquivo do Drive',
      ajuda: 'Cole o link de compartilhamento do arquivo no Google Drive.',
      placeholder: 'https://drive.google.com/file/d/…',
    },
    versao: { rotulo: 'Versão (opcional)', placeholder: 'Ex.: 2.1' },
    vigente_desde: { rotulo: 'Vigente desde (opcional)', controle: 'data' },
  },
  video: {
    titulo: { rotulo: 'Título do vídeo' },
    midia: { rotulo: 'Vídeo do YouTube', ajuda: 'Cole o link do vídeo (youtube.com ou youtu.be).', placeholder: 'https://youtu.be/…' },
  },
  imagem: {
    titulo: { rotulo: 'Descrição da imagem', ajuda: 'Lida por leitores de tela. Diga o que a imagem mostra.' },
  },
  link: {
    titulo: { rotulo: 'Texto do botão' },
  },
});

/**
 * @param {string} tipo Tipo do bloco.
 * @param {string} campo Campo.
 * @returns {InfoCampo} Rótulo, ajuda e controle.
 */
export const infoCampo = (tipo, campo) => ({
  controle: 'linha',
  ...CAMPOS_PADRAO[campo],
  ...((CAMPOS_POR_TIPO[tipo] || {})[campo] || {}),
});

/** Nome legível de cada módulo (páginas `tipo = modulo`). */
export const NOMES_MODULO = Object.freeze({
  feedback: 'Feedback anônimo',
  enquetes: 'Enquetes',
  marcos: 'Aniversários e tempo de casa',
  analise_consultas: 'Análise de consultas (CEO)',
  admin: 'Administração',
});

/**
 * Quem vê a página: as quatro combinações que fazem sentido (o servidor aceita só admin/ceo
 * como restrição; lista vazia = todos).
 * @type {ReadonlyArray<{valor: string, rotulo: string, papeis: Array<string>}>}
 */
export const OPCOES_PUBLICO_PAGINA = Object.freeze([
  { valor: 'todos', rotulo: 'Todos', papeis: [] },
  { valor: 'admin', rotulo: 'Só a gestão de pessoas', papeis: ['admin'] },
  { valor: 'admin,ceo', rotulo: 'Gestão de pessoas e CEO', papeis: ['admin', 'ceo'] },
  { valor: 'ceo', rotulo: 'Só o CEO', papeis: ['ceo'] },
]);

/**
 * @param {Array<string>} papeis Papéis da página.
 * @returns {string} `valor` da opção equivalente.
 */
export const valorPublicoPagina = (papeis) => {
  const chave = papeis.slice().sort().join(',');
  const opcao = OPCOES_PUBLICO_PAGINA.find((o) => o.papeis.slice().sort().join(',') === chave);
  return opcao ? opcao.valor : 'todos';
};

/**
 * Rótulo curto de uma especialidade (`educacao_fisica` → `Educação física`).
 * @param {string} slug Especialidade.
 * @returns {string} Rótulo.
 */
export const rotuloEspecialidade = (slug) => {
  const conhecidos = {
    medicina: 'Medicina',
    psicologia: 'Psicologia',
    nutricao: 'Nutrição',
    educacao_fisica: 'Educação física',
    veterinaria: 'Veterinária',
    dermatologia: 'Dermatologia',
  };
  if (conhecidos[slug]) return conhecidos[slug];
  const texto = slug.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// ─── Mídia (espelho de Blocos.gs) ──────────────────────────────────────────────────────

const REGEX_ID_DRIVE = /^[A-Za-z0-9_-]{20,100}$/;
const REGEX_ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const REGEX_URL_DRIVE = /^https:\/\/(?:drive|docs)\.google\.com\/(?:.*\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]{20,100})/;
const REGEX_URL_YOUTUBE = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/;

/**
 * @param {string} valor Texto colado.
 * @returns {?string} ID do Drive ou null.
 */
const idDrive = (valor) => {
  if (REGEX_ID_DRIVE.test(valor)) return valor;
  const m = REGEX_URL_DRIVE.exec(valor);
  return m ? m[1] : null;
};

/**
 * Converte o texto colado no campo `midia` na mídia que o portal vai usar — mesma regra do
 * servidor. O servidor continua sendo quem decide ao salvar; aqui é só para a prévia e para
 * avisar na hora.
 * @param {string} valor Texto do campo.
 * @param {EsperaMidia} espera Tipo de mídia do bloco.
 * @returns {?Midia} Mídia reconhecida ou null.
 */
export const midiaDoTexto = (valor, espera) => {
  const s = typeof valor === 'string' ? valor.trim() : '';
  if (!s || !espera) return null;
  if (espera === 'youtube') {
    if (REGEX_ID_YOUTUBE.test(s)) return { tipo: 'youtube', id: s };
    const m = REGEX_URL_YOUTUBE.exec(s);
    return m ? { tipo: 'youtube', id: m[1] } : null;
  }
  const drive = idDrive(s);
  if (drive) return { tipo: 'drive', id: drive };
  if (espera === 'drive') return null;
  try {
    const url = new URL(s);
    const host = url.hostname.toLowerCase();
    const permitido = HOSTS_IMAGEM.some((h) => host === h || host.endsWith(`.${h}`));
    return url.protocol === 'https:' && permitido ? { tipo: 'url', url: url.href } : null;
  } catch (erro) {
    return null;
  }
};

/**
 * @typedef {Object} DadosFormularioBloco Valores do formulário (strings cruas).
 * @property {string} tipo
 * @property {string} titulo
 * @property {string} subtitulo
 * @property {string} texto
 * @property {string} midia
 * @property {string} link
 * @property {string} versao
 * @property {string} vigente_desde
 * @property {Array<string>} publico
 */

/**
 * @typedef {Object} ContratoBloco
 * @property {Array<string>} obrigatorios
 * @property {Array<string>} permitidos
 * @property {EsperaMidia} midia
 */

/**
 * Bloco de prévia a partir do formulário: campos fora do contrato zerados (como o servidor
 * faz), mídia normalizada. O renderizador aplica de novo as próprias barreiras.
 * @param {DadosFormularioBloco} dados Formulário.
 * @param {ContratoBloco} contrato Contrato do tipo.
 * @param {string} [id='previa'] ID.
 * @returns {BlocoPublico} Bloco para `renderizarBlocos`.
 */
export const blocoDaPrevia = (dados, contrato, id = 'previa') => {
  const usa = (campo) => contrato.permitidos.includes(campo);
  const valor = (campo) => (usa(campo) && typeof dados[campo] === 'string' ? dados[campo].trim() : '');
  return {
    id,
    tipo: dados.tipo,
    ordem: 0,
    titulo: valor('titulo'),
    subtitulo: valor('subtitulo'),
    texto: valor('texto'),
    midia: usa('midia') ? midiaDoTexto(dados.midia, contrato.midia) : null,
    link: valor('link') || null,
    versao: valor('versao'),
    vigente_desde: valor('vigente_desde'),
    publico: dados.publico.length > 0 ? dados.publico.slice() : null,
  };
};

/**
 * Campos obrigatórios ainda vazios (checagem local, antes de ir ao servidor).
 * @param {DadosFormularioBloco} dados Formulário.
 * @param {ContratoBloco} contrato Contrato.
 * @returns {Array<string>} Campos faltando.
 */
export const camposFaltando = (dados, contrato) => contrato.obrigatorios
  .filter((campo) => typeof dados[campo] !== 'string' || dados[campo].trim() === '');
