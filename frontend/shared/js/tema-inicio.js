/* ============================================================
   Corte Certo – shared/js/tema-inicio.js
   Preloader de tema (antes do CSS, para evitar flash).
   Mantido em arquivo próprio para o CSP não precisar de
   'unsafe-inline' em script-src.
   ============================================================ */
document.documentElement.dataset.theme = localStorage.getItem('cc_tema') || 'dark';
(function () {
  /* RBAC de perfil (funcionário/dependente e ajudante): esconde a navegação
     da sidebar ANTES da primeira pintura, para não "flashear" itens restritos
     (Início, Serviços, Relatórios, Assinatura etc.) no dependente/barbeiro.
     A classe é removida quando aplicarRBACSidebar() conclui a remoção. */
  try {
    var u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u && (u.role === 'dependente' || u.role === 'barbeiro')) {
      document.documentElement.classList.add('cc-rbac-pending');
    }
  } catch (e) { /* sem sessão local (ex.: login) */ }
})();