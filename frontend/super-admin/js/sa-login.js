/* ============================================================
   Corte Certo – super-admin/js/sa-login.js
   Login do painel super-admin. Em arquivo externo para o CSP
   não precisar de 'unsafe-inline' em script-src.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('cc_superadmin_token')) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('sa-login-form');
  const btn = document.getElementById('sa-btn-entrar');
  const erroEl = document.getElementById('sa-error-msg');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('sa-email').value.trim();
    const senha = document.getElementById('sa-senha').value;

    if (!email || !senha) {
      erroEl.textContent = 'Preencha todos os campos.';
      erroEl.style.display = 'block';
      return;
    }

    erroEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    fetch('/api/super-admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email, senha: senha })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        const token = (data && data.data && data.data.token) || data.token;
        const erro = (data && data.error) || (data && data.data && data.data.error);
        if (erro) {
          erroEl.textContent = erro;
          erroEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Entrar';
          return;
        }
        if (token) {
          localStorage.setItem('cc_superadmin_token', token);
          window.location.href = 'index.html';
        } else {
          erroEl.textContent = 'Resposta inválida do servidor.';
          erroEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Entrar';
        }
      })
      .catch(function () {
        erroEl.textContent = 'Erro de conexão. Tente novamente.';
        erroEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Entrar';
      });
  });
});