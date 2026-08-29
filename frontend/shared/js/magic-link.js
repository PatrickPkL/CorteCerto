/* ============================================================
   Corte Certo – shared/js/magic-link.js
   Recebe o token via query string e inicia a sessão no admin.
   Em arquivo externo para o CSP não precisar de 'unsafe-inline'.
   ============================================================ */

(function () {
  var params = new URLSearchParams(location.search);
  var tk = params.get('token');
  if (tk) { localStorage.setItem('cc_magic_token', tk); }
  location.href = '../admin/';
})();