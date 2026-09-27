/**
 * @file modulos/feedback/feedback.js
 * Módulo "Feedback anônimo" (página `tipo = modulo`, `modulo = feedback`).
 *
 *   Responder   → quem responde (config `feedback_papeis_respondem`)
 *   Resultados  → quem vê (config `feedback_resultados_papeis`)
 *
 * As abas só escondem o que o usuário não usa: cada rota é autorizada no servidor.
 */

import { ErroApi } from '../../api.js';
import { logErro } from '../../log.js';
import { criarElemento } from '../../ui/dom.js';
import mostrarToast from '../../ui/toast.js';
import { criarEstadoEditor as criarEstado } from '../../editor/componentes.js';
import criarAbas from '../abas.js';
import { carregarStatus, rotuloCiclo } from './dados.js';
import criarFormulario from './formulario.js';
import criarResultados from './resultados.js';

/** @typedef {import('./dados.js').StatusFeedback} StatusFeedback */
/** @typedef {import('../modulos.js').ContextoModulo} ContextoModulo */

/**
 * Estado da aba "Responder" conforme o status do ciclo.
 * @param {StatusFeedback} status Status.
 * @param {function(): void} recarregar Recarrega do servidor.
 * @returns {HTMLElement} Conteúdo.
 */
const criarResponder = (status, recarregar) => {
  if (status.jaRespondeu) {
    return criarEstado({
      titulo: `Obrigado! Você já respondeu ao feedback de ${rotuloCiclo(status.ciclo)}.`,
      texto: 'Suas respostas foram registradas de forma anônima. O próximo ciclo aparece aqui quando abrir.',
      icone: 'sucesso',
    });
  }
  if (!status.habilitado) {
    return criarEstado({
      titulo: 'Não há feedback aberto agora.',
      texto: 'Quando um novo ciclo abrir, as perguntas aparecem aqui.',
      icone: 'calendario',
    });
  }
  return criarFormulario({
    status,
    aoEnviar: () => {
      mostrarToast('Respostas enviadas. Obrigado por participar!', { tipo: 'sucesso' });
      recarregar();
    },
    aoConflito: (erro) => {
      mostrarToast(erro.message, { tipo: 'alerta', duracaoMs: 7000 });
      recarregar();
    },
  });
};

/**
 * Monta o módulo na área dada.
 * @param {HTMLElement} area Contêiner do módulo (abaixo do título da página).
 * @param {ContextoModulo} ctx Contexto.
 * @returns {Promise<void>}
 */
const montarFeedback = async (area, ctx) => {
  const { permissoes } = ctx.snapshot.me;
  const responde = permissoes.responder_feedback === true;
  area.replaceChildren(criarEstado({ titulo: 'Carregando o feedback…', carregando: true }));

  /** @param {boolean} forcarRede Ignora o cache local. */
  const desenhar = async (forcarRede) => {
    let status;
    try {
      status = await carregarStatus({ forcarRede });
    } catch (erro) {
      if (!ctx.vigente()) return;
      if (!(erro instanceof ErroApi)) logErro('feedback_status_falhou', erro);
      area.replaceChildren(criarEstado({
        titulo: 'Não foi possível abrir o feedback agora.',
        texto: 'Verifique a conexão e tente de novo.',
        icone: 'alerta',
        acao: criarElemento('button', {
          classe: 'botao botao--secundario botao--sm',
          texto: 'Tentar de novo',
          atributos: { type: 'button' },
          eventos: { click: () => { desenhar(true); } },
        }),
      }));
      return;
    }
    if (!ctx.vigente()) return;
    const recarregar = () => { desenhar(true); };
    const abas = [];
    if (responde) abas.push({ id: 'responder', rotulo: 'Responder', criar: () => criarResponder(status, recarregar) });
    if (status.podeVerResultados) {
      abas.push({
        id: 'resultados',
        rotulo: 'Resultados',
        criar: () => criarResultados({ cicloAtual: status.ciclo, vigente: ctx.vigente }),
      });
    }
    if (abas.length === 0) {
      area.replaceChildren(criarEstado({
        titulo: 'O feedback não se aplica ao seu perfil.',
        texto: 'Quem responde e quem vê os resultados é definido pela gestão de pessoas.',
      }));
      return;
    }
    area.replaceChildren(abas.length === 1 ? abas[0].criar() : criarAbas({
      rotulo: 'Seções do feedback', abas, chave: 'feedback',
    }));
  };

  await desenhar(false);
};

export default montarFeedback;
