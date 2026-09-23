/**
 * @file eventos.js
 * Barramento de eventos mínimo (EventTarget nativo) para desacoplar módulos:
 * o transporte avisa que a sessão expirou sem importar a camada de UI.
 */

/**
 * @typedef {'sessao:expirada'|'sessao:trocou_conta'|'acesso:negado'
 *   |'dados:atualizados'|'cache:revalidado'} NomeEvento
 * - `sessao:expirada`: token vencido e sem renovação silenciosa (api.js).
 * - `sessao:trocou_conta`: a renovação devolveu outra conta Google (auth.js).
 * - `acesso:negado`: o servidor passou a negar o cadastro (desativado) numa atualização.
 * - `dados:atualizados`: novo snapshot do bootstrap após `check_update` com mudança.
 * - `cache:revalidado`: revalidação SWR de uma ação trouxe dado novo.
 */

const barramento = new EventTarget();

/**
 * @param {NomeEvento} nome Evento.
 * @param {*} [detalhe] Dados do evento.
 * @returns {void}
 */
export const emitir = (nome, detalhe) => {
  barramento.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
};

/**
 * @param {NomeEvento} nome Evento.
 * @param {function(*): void} ouvinte Recebe o `detail`.
 * @returns {function(): void} Cancela a inscrição.
 */
export const ouvir = (nome, ouvinte) => {
  const tratador = (evento) => ouvinte(evento.detail);
  barramento.addEventListener(nome, tratador);
  return () => barramento.removeEventListener(nome, tratador);
};
