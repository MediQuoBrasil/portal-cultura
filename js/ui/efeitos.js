/**
 * @file ui/efeitos.js
 * Micro-interações do design system (frontend.md, "Bold Factor"):
 * - spotlight que segue o cursor em `.spotlight` (delegado, 1 ouvinte, rAF);
 * - parallax do hero `[data-parallax]` (opacidade 1→0, escala 1→0,95, y 0→100px);
 * - revelar ao rolar `[data-revelar]` (limiar 15%, uma vez, escalonado em 80 ms).
 * Tudo desliga com `prefers-reduced-motion`; o spotlight só roda com ponteiro fino.
 */

const reduzido = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
const ponteiroFino = globalThis.matchMedia('(hover: hover) and (pointer: fine)');

/** @type {?IntersectionObserver} */
let observadorRevelar = null;

/** @returns {void} */
const iniciarSpotlight = () => {
  let quadroPendente = 0;
  /** @type {?HTMLElement} */
  let alvo = null;
  let x = 0;
  let y = 0;
  document.addEventListener('pointermove', (evento) => {
    if (!ponteiroFino.matches || reduzido.matches) return;
    const encontrado = evento.target instanceof Element ? evento.target.closest('.spotlight') : null;
    if (!encontrado) return;
    alvo = encontrado;
    x = evento.clientX;
    y = evento.clientY;
    if (quadroPendente) return;
    quadroPendente = requestAnimationFrame(() => {
      quadroPendente = 0;
      if (!alvo) return;
      const caixa = alvo.getBoundingClientRect();
      alvo.style.setProperty('--spot-x', `${Math.round(x - caixa.left)}px`);
      alvo.style.setProperty('--spot-y', `${Math.round(y - caixa.top)}px`);
    });
  }, { passive: true });
};

/** @returns {void} */
const aplicarParallax = () => {
  const rolagem = globalThis.scrollY;
  document.querySelectorAll('[data-parallax]').forEach((hero) => {
    if (reduzido.matches) {
      hero.style.removeProperty('opacity');
      hero.style.removeProperty('transform');
      return;
    }
    const metade = Math.max(1, hero.offsetHeight * 0.5);
    const progresso = Math.min(1, Math.max(0, rolagem / metade));
    hero.style.setProperty('opacity', String(1 - progresso));
    hero.style.setProperty('transform', `translateY(${Math.round(progresso * 100)}px) scale(${1 - progresso * 0.05})`);
  });
};

/** @returns {void} */
const iniciarParallax = () => {
  let quadroPendente = 0;
  globalThis.addEventListener('scroll', () => {
    if (quadroPendente) return;
    quadroPendente = requestAnimationFrame(() => {
      quadroPendente = 0;
      aplicarParallax();
    });
  }, { passive: true });
  reduzido.addEventListener('change', aplicarParallax);
};

/** @returns {IntersectionObserver} Observador único. */
const obterObservador = () => {
  if (!observadorRevelar) {
    observadorRevelar = new IntersectionObserver((entradas, observador) => {
      entradas.filter((e) => e.isIntersecting).forEach((e) => {
        e.target.classList.add('revelado');
        observador.unobserve(e.target);
      });
    }, { threshold: 0.15 });
  }
  return observadorRevelar;
};

/**
 * Observa os `[data-revelar]` ainda não revelados dentro da raiz (chamar após renderizar).
 * @param {ParentNode} [raiz=document] Raiz.
 * @returns {void}
 */
export const revelar = (raiz = document) => {
  const alvos = Array.from(raiz.querySelectorAll('[data-revelar]:not(.revelado)'));
  if (reduzido.matches || !('IntersectionObserver' in globalThis)) {
    alvos.forEach((el) => el.classList.add('revelado'));
    return;
  }
  const observador = obterObservador();
  alvos.forEach((el) => {
    const irmaos = el.parentElement ? Array.from(el.parentElement.querySelectorAll(':scope > [data-revelar]')) : [el];
    el.style.setProperty('--atraso', `${Math.min(irmaos.indexOf(el), 8) * 80}ms`);
    observador.observe(el);
  });
};

/**
 * Liga os efeitos globais (uma vez, no início da página).
 * @returns {void}
 */
export const iniciarEfeitos = () => {
  document.documentElement.classList.add('efeitos-ativos');
  iniciarSpotlight();
  iniciarParallax();
};

/**
 * Zera o parallax (ex.: ao trocar de tela, com o hero fora de posição).
 * @returns {void}
 */
export const reiniciarParallax = () => aplicarParallax();
