/* ============================================================
   Corte Certo – shared/js/tema-inicio.js
   Preloader de tema (antes do CSS, para evitar flash).
   Mantido em arquivo próprio para o CSP não precisar de
   'unsafe-inline' em script-src.
   ============================================================ */
document.documentElement.dataset.theme = localStorage.getItem('cc_tema') || 'dark';