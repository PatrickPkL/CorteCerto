/* ============================================================
   Corte Certo – public/js/telainicial.js
   Coreografia da splash: logo surge (fade-in), pausa, a tela
   preta some (fade-out) e o nó é removido do DOM revelando a
   página. Total ≈ 2,8s em toda visita.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash');
  if (!splash) return;

  /* fallback: se a imagem faltar, troca por marca em texto */
  const logo = document.getElementById('splash-logo');
  logo?.addEventListener('error', () => {
    const marca = document.createElement('div');
    marca.className = 'splash-marca';
    marca.innerHTML = 'Corte<span>Certo</span>';
    logo.replaceWith(marca);
  });

  /* logo do hero: se a imagem faltar, esconde */
  document.querySelectorAll('img.hero-logo').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  /* respeita quem prefere menos movimento */
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T_ENTRA = reduz ? 0 : 900;   // fade-in da logo
  const T_PARA  = reduz ? 300 : 1200; // pausa com a tela cheia
  const T_SAI   = reduz ? 0 : 700;   // fade-out da tela preta

  requestAnimationFrame(() => splash.classList.add('splash-pronta'));

  setTimeout(() => {
    splash.classList.add('splash-saindo');
    setTimeout(() => splash.remove(), T_SAI + 60);
  }, T_ENTRA + T_PARA);

  /* área de autenticação no header (shared.js) */
  if (typeof renderNavAuth === 'function') renderNavAuth();
});
