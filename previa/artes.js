/**
 * @file previa/artes.js
 * Artes de aniversário e tempo de casa desenhadas em <canvas> (1080×1350, formato 4:5).
 * Simula o que o backend (Artes.gs) gera a partir do template do Slides. Usa a paleta da
 * marca MediQuo (roxo + turquesa), independente do tema do portal: a arte é peça externa.
 */

import { AREA_POR_ID, PROFISSIONAIS, PROFISSIONAL_POR_ID } from './dados.js';
import { celebracoesProximas } from './celebracoes.js';
import {
  criarElemento, exigirElemento, mostrarToast, primeiroNome,
} from './ui.js';

/** @typedef {import('./dados.js').Profissional} Profissional */

/**
 * @typedef {Object} Modelo
 * @property {string} id 'aniversario' ou 'casa-N'.
 * @property {'aniversario'|'casa'} tipo Tipo.
 * @property {number} anos Anos de casa (0 no aniversário).
 * @property {string} rotulo Nome exibido na galeria.
 */

/**
 * @typedef {Object} DadosArte
 * @property {Modelo} modelo Modelo.
 * @property {Profissional} pessoa Profissional.
 * @property {string} mensagem Mensagem.
 */

const LARGURA = 1080;
const ALTURA = 1350;
const MARGEM = 96;
const LARGURA_UTIL = LARGURA - MARGEM * 2;
const FONTE = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
const COR = Object.freeze({
  roxoClaro: '#b79cff', turquesa: '#42cece', branco: '#ffffff', amarelo: '#ffd166',
});
const MENSAGEM_PADRAO = Object.freeze({
  aniversario: 'Que o seu novo ano seja tão cheio de cuidado quanto o que você oferece a cada paciente.',
  casa: 'Obrigado por cuidar das pessoas e de quem elas amam com a gente.',
});

/**
 * @param {string} id ID do modelo.
 * @returns {?Modelo} Modelo, ou null se inválido.
 */
const modeloPorId = (id) => {
  if (id === 'aniversario') {
    return {
      id, tipo: 'aniversario', anos: 0, rotulo: 'Aniversário',
    };
  }
  const encontrado = /^casa-(\d{1,2})$/.exec(String(id));
  const anos = encontrado ? Number(encontrado[1]) : 0;
  if (anos < 1) return null;
  return {
    id, tipo: 'casa', anos, rotulo: `${anos} ${anos === 1 ? 'ano' : 'anos'} de casa`,
  };
};

/** @type {Array<Modelo>} */
const modelos = ['aniversario', 'casa-1', 'casa-2', 'casa-3', 'casa-4', 'casa-5'].map(modeloPorId);

const estado = {
  /** @type {Modelo} */
  modelo: modelos[0],
  /** @type {?Profissional} */
  pessoa: null,
  mensagemEditada: false,
};

/**
 * PRNG determinístico (mulberry32): o confete fica igual para a mesma pessoa.
 * @param {number} semente Semente inteira.
 * @returns {function(): number} Gerador em [0, 1).
 */
const criarAleatorio = (semente) => {
  let a = semente >>> 0; // eslint-disable-line no-bitwise
  return () => {
    /* eslint-disable no-bitwise */
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    /* eslint-enable no-bitwise */
  };
};

/**
 * @param {CanvasRenderingContext2D} ctx Contexto.
 * @param {number} x X.
 * @param {number} y Y.
 * @param {number} l Largura.
 * @param {number} a Altura.
 * @param {number} r Raio.
 * @returns {void}
 */
const tracarRetanguloArredondado = (ctx, x, y, l, a, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + a, r);
  ctx.arcTo(x + l, y + a, x, y + a, r);
  ctx.arcTo(x, y + a, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
};

/**
 * Define a fonte reduzindo o tamanho até o texto caber na largura.
 * @param {CanvasRenderingContext2D} ctx Contexto.
 * @param {string} texto Texto.
 * @param {number} peso Peso da fonte.
 * @param {number} tamanho Tamanho inicial (px).
 * @param {number} minimo Tamanho mínimo (px).
 * @param {number} largura Largura máxima.
 * @returns {number} Tamanho aplicado.
 */
const ajustarFonte = (ctx, texto, peso, tamanho, minimo, largura) => {
  let atual = tamanho;
  ctx.font = `${peso} ${atual}px ${FONTE}`;
  while (atual > minimo && ctx.measureText(texto).width > largura) {
    atual -= 2;
    ctx.font = `${peso} ${atual}px ${FONTE}`;
  }
  return atual;
};

/**
 * Quebra o texto em linhas que caibam na largura (máx. `limite` linhas, com reticências).
 * @param {CanvasRenderingContext2D} ctx Contexto com a fonte já definida.
 * @param {string} texto Texto.
 * @param {number} largura Largura máxima.
 * @param {number} limite Máximo de linhas.
 * @returns {Array<string>} Linhas.
 */
const quebrarLinhas = (ctx, texto, largura, limite) => {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  palavras.forEach((palavra) => {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width <= largura || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  });
  if (atual) linhas.push(atual);
  if (linhas.length <= limite) return linhas;
  const cortadas = linhas.slice(0, limite);
  cortadas[limite - 1] = `${cortadas[limite - 1].replace(/[\s,.;:]+$/, '')}…`;
  return cortadas;
};

/**
 * @param {CanvasRenderingContext2D} ctx Contexto.
 * @param {number} x Centro X.
 * @param {number} y Centro Y.
 * @param {number} raio Raio.
 * @param {string} cor Cor do centro (rgba).
 * @returns {void}
 */
const pintarBrilho = (ctx, x, y, raio, cor) => {
  const gradiente = ctx.createRadialGradient(x, y, 0, x, y, raio);
  gradiente.addColorStop(0, cor);
  gradiente.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
};

/**
 * Fundo: gradiente da marca, dois brilhos, grade técnica e moldura.
 * @param {CanvasRenderingContext2D} ctx Contexto.
 * @returns {void}
 */
const pintarFundo = (ctx) => {
  const base = ctx.createLinearGradient(0, 0, LARGURA, ALTURA);
  base.addColorStop(0, '#2b1170');
  base.addColorStop(0.55, '#1a0a4a');
  base.addColorStop(1, '#0d0628');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  pintarBrilho(ctx, 880, 200, 640, 'rgba(66, 206, 206, 0.36)');
  pintarBrilho(ctx, 120, 1200, 720, 'rgba(123, 79, 224, 0.55)');

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 72; x < LARGURA; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, ALTURA);
    ctx.stroke();
  }
  for (let y = 72; y < ALTURA; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(LARGURA, y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  tracarRetanguloArredondado(ctx, 40, 40, LARGURA - 80, ALTURA - 80, 40);
  ctx.stroke();
};

/**
 * @param {CanvasRenderingContext2D} ctx Contexto.
 * @param {string} semente Texto-semente (nome).
 * @returns {void}
 */
const pintarConfete = (ctx, semente) => {
  const aleatorio = criarAleatorio(Array.from(semente).reduce((soma, c) => soma + c.charCodeAt(0), 7));
  const cores = [COR.turquesa, COR.branco, COR.roxoClaro, COR.amarelo];
  for (let i = 0; i < 46; i += 1) {
    // Faixa superior inteira + canto à direita de "Feliz": nunca sobre nome, mensagem ou rodapé.
    const faixaAlta = aleatorio() > 0.3;
    const x = faixaAlta ? 60 + aleatorio() * (LARGURA - 120) : 560 + aleatorio() * 420;
    const y = faixaAlta ? 200 + aleatorio() * 240 : 450 + aleatorio() * 90;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aleatorio() * Math.PI);
    ctx.globalAlpha = 0.55 + aleatorio() * 0.4;
    ctx.fillStyle = cores[Math.floor(aleatorio() * cores.length)];
    tracarRetanguloArredondado(ctx, -5, -12, 10, 24, 4);
    ctx.fill();
    ctx.restore();
  }
};

/**
 * @param {CanvasRenderingContext2D} ctx Contexto.
 * @param {string} texto Texto.
 * @param {number} x X.
 * @param {number} y Linha de base.
 * @param {number} altura Altura do bloco (para o gradiente vertical).
 * @returns {void}
 */
const escreverComGradiente = (ctx, texto, x, y, altura) => {
  const gradiente = ctx.createLinearGradient(0, y - altura, 0, y);
  gradiente.addColorStop(0, COR.branco);
  gradiente.addColorStop(1, '#a8f0f0');
  ctx.fillStyle = gradiente;
  ctx.fillText(texto, x, y);
};

/**
 * Nome, selo da área, mensagem e assinatura, a partir de `y`.
 * @param {CanvasRenderingContext2D} ctx Contexto.
 * @param {DadosArte} dados Dados.
 * @param {number} y Linha de base do nome.
 * @returns {void}
 */
const pintarRodape = (ctx, dados, y) => {
  const area = AREA_POR_ID[dados.pessoa.area];
  ctx.fillStyle = COR.branco;
  ajustarFonte(ctx, dados.pessoa.nome, 600, 76, 44, LARGURA_UTIL);
  ctx.fillText(dados.pessoa.nome, MARGEM, y);

  ctx.font = `500 30px ${FONTE}`;
  const larguraSelo = ctx.measureText(area.nome).width + 48;
  tracarRetanguloArredondado(ctx, MARGEM, y + 34, larguraSelo, 56, 28);
  ctx.fillStyle = 'rgba(66, 206, 206, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(66, 206, 206, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = COR.turquesa;
  ctx.fillText(area.nome, MARGEM + 24, y + 73);

  ctx.font = `400 38px ${FONTE}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
  quebrarLinhas(ctx, dados.mensagem, LARGURA_UTIL, 3).forEach((linha, i) => {
    ctx.fillText(linha, MARGEM, y + 170 + i * 54);
  });

  ctx.font = `600 34px ${FONTE}`;
  ctx.fillStyle = COR.branco;
  ctx.fillText('MediQuo', MARGEM, ALTURA - 110);
  ctx.font = `400 26px ${FONTE}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.textAlign = 'right';
  ctx.fillText('Cuidar das pessoas e de quem elas amam.', LARGURA - MARGEM, ALTURA - 112);
  ctx.textAlign = 'left';
};

/**
 * Desenha a arte completa num canvas de qualquer tamanho (escala a partir de 1080×1350).
 * @param {HTMLCanvasElement} canvas Canvas.
 * @param {DadosArte} dados Dados.
 * @returns {void}
 */
const desenharArte = (canvas, dados) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const escala = canvas.width / LARGURA;
  ctx.save();
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  pintarFundo(ctx);

  ctx.font = `500 28px ${FONTE}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('Portal de Cultura', MARGEM, 150);

  if (dados.modelo.tipo === 'aniversario') {
    pintarConfete(ctx, dados.pessoa.nome);
    ctx.font = `600 150px ${FONTE}`;
    escreverComGradiente(ctx, 'Feliz', MARGEM - 6, 590, 130);
    ajustarFonte(ctx, 'aniversário!', 600, 150, 90, LARGURA_UTIL + 12);
    escreverComGradiente(ctx, 'aniversário!', MARGEM - 6, 740, 130);
    pintarRodape(ctx, dados, 870);
  } else {
    const numero = String(dados.modelo.anos);
    ctx.font = `600 440px ${FONTE}`;
    escreverComGradiente(ctx, numero, MARGEM - 20, 700, 330);
    const larguraNumero = ctx.measureText(numero).width;
    ctx.font = `600 72px ${FONTE}`;
    ctx.fillStyle = COR.branco;
    ctx.fillText(dados.modelo.anos === 1 ? 'ano' : 'anos', MARGEM + larguraNumero + 8, 560);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('de casa', MARGEM + larguraNumero + 8, 650);
    pintarRodape(ctx, dados, 870);
  }
  ctx.restore();
};

/** @returns {DadosArte} Dados atuais. */
const dadosAtuais = () => ({
  modelo: estado.modelo,
  pessoa: /** @type {Profissional} */ (estado.pessoa),
  mensagem: /** @type {HTMLTextAreaElement} */ (exigirElemento('arteMensagem')).value.trim()
    || MENSAGEM_PADRAO[estado.modelo.tipo],
});

/** @returns {void} */
const renderizarGaleria = () => {
  const alvo = exigirElemento('arteModelos');
  alvo.replaceChildren(...modelos.map((modelo) => {
    const miniatura = criarElemento('canvas', { atributos: { width: '216', height: '270', 'aria-hidden': 'true' } });
    desenharArte(/** @type {HTMLCanvasElement} */ (miniatura), { ...dadosAtuais(), modelo, mensagem: MENSAGEM_PADRAO[modelo.tipo] });
    const selecionado = modelo.id === estado.modelo.id;
    return criarElemento('button', {
      classe: 'prot-modelo',
      atributos: {
        type: 'button', role: 'radio', 'aria-checked': selecionado ? 'true' : 'false', tabindex: selecionado ? '0' : '-1',
        'data-modelo': modelo.id,
      },
      filhos: [miniatura, modelo.rotulo],
      eventos: { click: () => selecionarModelo(modelo.id) }, // eslint-disable-line no-use-before-define
    });
  }));
};

/** @returns {void} */
const renderizarPrincipal = () => {
  desenharArte(/** @type {HTMLCanvasElement} */ (exigirElemento('arteCanvas')), dadosAtuais());
  exigirElemento('arteCanvas').setAttribute(
    'aria-label',
    `Pré-visualização: arte de ${estado.modelo.rotulo.toLowerCase()} para ${estado.pessoa ? estado.pessoa.nome : ''}`,
  );
};

/**
 * @param {string} id ID do modelo.
 * @returns {void}
 */
const selecionarModelo = (id) => {
  let modelo = modelos.find((m) => m.id === id) || null;
  if (!modelo) {
    modelo = modeloPorId(id);
    if (!modelo) return;
    modelos.push(modelo); // Ex.: 7 anos de casa vindo da página de celebrações.
  }
  estado.modelo = modelo;
  if (!estado.mensagemEditada) {
    /** @type {HTMLTextAreaElement} */ (exigirElemento('arteMensagem')).value = MENSAGEM_PADRAO[modelo.tipo];
  }
  renderizarGaleria();
  renderizarPrincipal();
};

/** @returns {void} */
const baixarArte = () => {
  const canvas = /** @type {HTMLCanvasElement} */ (exigirElemento('arteCanvas'));
  canvas.toBlob((blob) => {
    if (!blob) {
      mostrarToast('Não foi possível gerar o PNG neste navegador.', 'erro');
      return;
    }
    const url = URL.createObjectURL(blob);
    const nome = `arte-${estado.modelo.id}-${primeiroNome(estado.pessoa ? estado.pessoa.nome : 'profissional').toLowerCase()}.png`;
    const link = criarElemento('a', { atributos: { download: nome } });
    link.href = url; // blob: local, atribuído por propriedade (não passa pelo validador de URL).
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    mostrarToast('Arte baixada.', 'sucesso');
  }, 'image/png');
};

/**
 * Setas do teclado percorrem os modelos (padrão de radiogroup).
 * @param {KeyboardEvent} evento Evento.
 * @returns {void}
 */
const navegarModelos = (evento) => {
  const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key];
  if (!passo) return;
  evento.preventDefault();
  const indice = modelos.findIndex((m) => m.id === estado.modelo.id);
  const proximo = modelos[(indice + passo + modelos.length) % modelos.length];
  selecionarModelo(proximo.id);
  const botao = exigirElemento('arteModelos').querySelector(`[data-modelo="${proximo.id}"]`);
  if (botao instanceof HTMLElement) botao.focus();
};

/**
 * Aplica parâmetros vindos da rota (#/artes?pessoa=p3&modelo=casa-2).
 * @param {URLSearchParams} parametros Parâmetros.
 * @returns {void}
 */
export const aoEntrarArtes = (parametros) => {
  const pessoa = PROFISSIONAL_POR_ID[parametros.get('pessoa') || ''];
  if (pessoa) {
    estado.pessoa = pessoa;
    /** @type {HTMLSelectElement} */ (exigirElemento('artePessoa')).value = pessoa.id;
  }
  const modelo = parametros.get('modelo');
  if (modelo) selecionarModelo(modelo);
  else renderizarGaleria();
  renderizarPrincipal();
};

/**
 * Liga a página (uma vez). Espera a fonte Inter para o canvas não desenhar com fallback.
 * @returns {Promise<void>}
 */
export const iniciarArtes = async () => {
  const seletor = /** @type {HTMLSelectElement} */ (exigirElemento('artePessoa'));
  const ordenados = [...PROFISSIONAIS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  seletor.replaceChildren(...ordenados.map((p) => criarElemento('option', {
    texto: `${p.nome} (${AREA_POR_ID[p.area].nome})`, atributos: { value: p.id },
  })));
  const proxima = celebracoesProximas(30)[0];
  estado.pessoa = proxima ? proxima.pessoa : ordenados[0];
  seletor.value = estado.pessoa.id;

  const mensagem = /** @type {HTMLTextAreaElement} */ (exigirElemento('arteMensagem'));
  mensagem.value = MENSAGEM_PADRAO[estado.modelo.tipo];

  seletor.addEventListener('change', () => {
    estado.pessoa = PROFISSIONAL_POR_ID[seletor.value] || estado.pessoa;
    renderizarGaleria();
    renderizarPrincipal();
  });
  mensagem.addEventListener('input', () => {
    estado.mensagemEditada = mensagem.value.trim() !== '';
    renderizarPrincipal();
  });
  exigirElemento('arteModelos').addEventListener('keydown', navegarModelos);
  exigirElemento('arteFormulario').addEventListener('submit', (evento) => {
    evento.preventDefault();
    baixarArte();
  });

  try {
    await Promise.all(['600 100px Inter', '500 30px Inter', '400 38px Inter'].map((f) => document.fonts.load(f)));
  } catch (erro) {
    console.warn('[prototipo] fonte Inter indisponível para o canvas; usando fallback', erro instanceof Error ? erro.name : '');
  }
  renderizarGaleria();
  renderizarPrincipal();
};
