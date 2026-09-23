/**
 * @file previa/dados.js
 * Dados FICTÍCIOS do protótipo (no portal final, vêm da planilha via backend).
 * Parte das datas é calculada a partir de hoje para que a demonstração sempre tenha
 * aniversários e reuniões próximos, em qualquer dia em que for apresentada.
 */

import { hoje, somarDias } from './ui.js';

/**
 * @typedef {Object} Area
 * @property {string} id Identificador.
 * @property {string} nome Nome exibido.
 * @property {string} cor Cor de marcação (legível nos dois temas).
 */

/** @type {ReadonlyArray<Area>} */
export const AREAS = Object.freeze([
  { id: 'medicina', nome: 'Medicina', cor: '#6872d9' },
  { id: 'psicologia', nome: 'Psicologia', cor: '#a855f7' },
  { id: 'nutricao', nome: 'Nutrição', cor: '#3fae76' },
  { id: 'educacao-fisica', nome: 'Educação física', cor: '#e8893a' },
  { id: 'veterinaria', nome: 'Medicina veterinária', cor: '#3b82f6' },
  { id: 'dermatologia', nome: 'Dermatologia', cor: '#e0607e' },
]);

/** @type {Readonly<Object<string, Area>>} */
export const AREA_POR_ID = Object.freeze(Object.fromEntries(AREAS.map((a) => [a.id, a])));

/**
 * @typedef {Object} DiaMes
 * @property {number} dia Dia (1–31).
 * @property {number} mes Mês (0–11).
 */

/**
 * @typedef {Object} Profissional
 * @property {string} id Identificador.
 * @property {string} nome Nome.
 * @property {string} area ID da área.
 * @property {DiaMes} aniversario Dia e mês de nascimento (sem ano).
 * @property {Date} entrada Data de entrada na empresa.
 */

const NOMES = Object.freeze([
  'Beatriz Almeida', 'Carlos Menezes', 'Daniela Rocha', 'Eduardo Farias', 'Fernanda Lima', 'Gabriel Nogueira',
  'Helena Duarte', 'Igor Tavares', 'Juliana Pires', 'Lucas Barros', 'Mariana Couto', 'Nicolas Prado',
  'Olívia Campos', 'Paulo Siqueira', 'Rafaela Moura', 'Sérgio Antunes', 'Tatiana Reis', 'Vinícius Paiva',
  'Yasmin Freitas', 'André Castro', 'Bruna Teles', 'Caio Monteiro', 'Débora Sales', 'Enzo Vieira',
  'Flávia Brandão', 'Gustavo Leal', 'Isabela Queiroz', 'João Pedro Matos', 'Larissa Fontes', 'Mateus Arruda',
]);

/** Aniversários a N dias de hoje (índices 0–3), para a demonstração ter "próximos dias". */
const ANIVERSARIOS_PROXIMOS = Object.freeze([0, 2, 5, 11]);
/** Tempo de casa a N dias de hoje (índices 6–9) e quantos anos completam. */
const ENTRADAS_PROXIMAS = Object.freeze([[1, 1], [3, 2], [-4, 3], [9, 5]]);
/** Recém-chegados deste ano (índices 12–13): dias atrás. */
const RECEM_CHEGADOS = Object.freeze([20, 45]);

/**
 * @param {number} i Índice do profissional.
 * @param {Date} base Hoje.
 * @returns {DiaMes} Aniversário.
 */
const gerarAniversario = (i, base) => {
  if (i < ANIVERSARIOS_PROXIMOS.length) {
    const data = somarDias(base, ANIVERSARIOS_PROXIMOS[i]);
    return { dia: data.getDate(), mes: data.getMonth() };
  }
  return { dia: ((i * 11) % 27) + 1, mes: (i * 5) % 12 };
};

/**
 * @param {number} i Índice do profissional.
 * @param {Date} base Hoje.
 * @returns {Date} Data de entrada.
 */
const gerarEntrada = (i, base) => {
  const proxima = ENTRADAS_PROXIMAS[i - 6];
  if (proxima) {
    const data = somarDias(base, proxima[0]);
    return new Date(data.getFullYear() - proxima[1], data.getMonth(), data.getDate());
  }
  const recente = RECEM_CHEGADOS[i - 12];
  if (recente) return somarDias(base, -recente);
  const ano = Math.min(2019 + (i % 7), base.getFullYear() - 1);
  return new Date(ano, (i * 7 + 3) % 12, ((i * 13) % 27) + 1);
};

/**
 * Monta a lista fictícia de profissionais.
 * @returns {ReadonlyArray<Profissional>} Profissionais.
 */
const montarProfissionais = () => {
  const base = hoje();
  return Object.freeze(NOMES.map((nome, i) => Object.freeze({
    id: `p${i + 1}`,
    nome,
    area: AREAS[i % AREAS.length].id,
    aniversario: gerarAniversario(i, base),
    entrada: gerarEntrada(i, base),
  })));
};

/** @type {ReadonlyArray<Profissional>} */
export const PROFISSIONAIS = montarProfissionais();

/** @type {Readonly<Object<string, Profissional>>} */
export const PROFISSIONAL_POR_ID = Object.freeze(Object.fromEntries(PROFISSIONAIS.map((p) => [p.id, p])));

/** Temas de pauta sugeridos para a reunião individual. */
export const PAUTAS = Object.freeze([
  'Agenda e volume de atendimentos',
  'Qualidade e protocolos',
  'Tecnologia e plataforma',
  'Pagamentos e valor da hora',
  'Desenvolvimento e carreira',
  'Outro assunto',
]);

/** Horários ofertados pela gestão de saúde nos dias de 1:1 (ter, qua, qui). */
export const HORARIOS_REUNIAO = Object.freeze(['09:00', '10:30', '14:00', '16:30']);

/** Dias da semana com agenda de 1:1 (0 = domingo). */
export const DIAS_REUNIAO = Object.freeze([2, 3, 4]);

/**
 * Horário já ocupado? Determinístico para o protótipo (sempre o mesmo resultado no mesmo dia).
 * @param {Date} data Dia.
 * @param {number} indiceHorario Índice em HORARIOS_REUNIAO.
 * @returns {boolean} Ocupado.
 */
export const horarioOcupado = (data, indiceHorario) => (data.getDate() + indiceHorario) % 3 === 0;

/**
 * @typedef {'aguardando-pauta'|'pauta-validada'|'presenca-confirmada'|'aguardando-validacao'|'validada'|'correcao-solicitada'} StatusReuniao
 */

/**
 * @typedef {Object} Reuniao
 * @property {string} id Identificador.
 * @property {Date} data Dia.
 * @property {string} horario HH:MM.
 * @property {Array<string>} pautas Temas.
 * @property {string} detalhe Texto livre.
 * @property {StatusReuniao} status Status.
 * @property {?{pontos: Array<string>, encaminhamentos: Array<string>}} resumo Resumo pós-reunião.
 */

/**
 * Próximo dia de agenda de 1:1 a partir de `inicio` (inclusive).
 * @param {Date} inicio Data inicial.
 * @returns {Date} Dia com agenda.
 */
export const proximoDiaDeReuniao = (inicio) => {
  let data = inicio;
  while (!DIAS_REUNIAO.includes(data.getDay())) data = somarDias(data, 1);
  return data;
};

/**
 * Reuniões iniciais da demonstração: uma futura (pauta validada) e uma passada
 * aguardando a validação do resumo pelo profissional.
 * @returns {Array<Reuniao>} Reuniões.
 */
export const reunioesIniciais = () => {
  const base = hoje();
  return [
    {
      id: 'r1',
      data: proximoDiaDeReuniao(somarDias(base, 4)),
      horario: '10:30',
      pautas: ['Agenda e volume de atendimentos', 'Tecnologia e plataforma'],
      detalhe: '',
      status: 'pauta-validada',
      resumo: null,
    },
    {
      id: 'r0',
      data: somarDias(base, -9),
      horario: '14:00',
      pautas: ['Desenvolvimento e carreira'],
      detalhe: '',
      status: 'aguardando-validacao',
      resumo: {
        pontos: [
          'Interesse em ampliar a atuação para atendimentos de acolhimento empresarial.',
          'Feedback positivo sobre a estabilidade da plataforma no último mês.',
          'Dificuldade pontual com a agenda das sextas-feiras à tarde.',
        ],
        encaminhamentos: [
          'Gestão de saúde envia a trilha de capacitação em acolhimento até o fim do mês.',
          'Revisar a abertura de agenda das sextas na próxima escala.',
          'Próxima reunião individual em 60 dias.',
        ],
      },
    },
  ];
};

/**
 * @typedef {Object} OpcaoEnquete
 * @property {string} id Identificador.
 * @property {Date} data Dia.
 * @property {string} horario Faixa de horário.
 * @property {number} votos Votos já registrados (fictícios).
 */

/**
 * Opções da enquete: ter 19h, qui 12h30 e sáb 10h nas próximas duas semanas.
 * @returns {Array<OpcaoEnquete>} Opções.
 */
export const opcoesEnquete = () => {
  const base = hoje();
  /** @type {Array<[number, string]>} dia da semana → horário */
  const modelos = [[2, '19h às 19h45'], [4, '12h30 às 13h15'], [6, '10h às 10h45']];
  const votos = [14, 9, 21, 6, 11, 8];
  const opcoes = [];
  [7, 14].forEach((deslocamento) => {
    modelos.forEach(([diaSemana, horario]) => {
      // Todas as opções ficam depois do encerramento da enquete (hoje + 5).
      let data = somarDias(base, deslocamento + 1);
      while (data.getDay() !== diaSemana) data = somarDias(data, 1);
      opcoes.push({
        id: `o${opcoes.length + 1}`, data, horario, votos: votos[opcoes.length],
      });
    });
  });
  return opcoes.sort((a, b) => a.data - b.data).slice(0, 5);
};

/** Perguntas da pesquisa de satisfação (escala 1–5). */
export const PERGUNTAS_CSAT = Object.freeze([
  { id: 'geral', texto: 'Qual sua satisfação geral com a prestação de serviços?' },
  { id: 'tecnologia', texto: 'Qual sua satisfação com a tecnologia?' },
  { id: 'gestao', texto: 'Qual sua satisfação com sua gestão direta?' },
  { id: 'valor_hora', texto: 'Qual sua satisfação com o valor da hora?' },
]);
