/**
 * @file tema-inicial.js
 * Script clássico e síncrono no <head>: aplica o tema salvo ANTES da primeira pintura (evita
 * o "flash" de tema errado). Arquivo externo — não exige 'unsafe-inline' na CSP.
 * A chave deve ser a mesma de js/ui/tema.js.
 */
{
  const CHAVE_TEMA = 'pc:tema';
  let tema = 'dark';
  try {
    tema = localStorage.getItem(CHAVE_TEMA) === 'light' ? 'light' : 'dark';
  } catch (erro) {
    // Storage bloqueado: fica o padrão escuro.
  }
  document.documentElement.setAttribute('data-theme', tema);
}
