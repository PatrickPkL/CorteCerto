/* ============================================================
   Corte Certo – admin/js/login.js
   Login por E-MAIL + código de verificação; recuperação de
   acesso por telefone OU e-mail (RF-001..005, DT-13).
   Requer db.js, auth.js, local-api.js e shared.js antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- seletor de papel ---------- */
  const roleBtns = document.querySelectorAll('.role-btn');
  const painelCliente = document.getElementById('painel-cliente');
  const painelDono = document.getElementById('painel-dono');

  function mostrarPapel(papel) {
    roleBtns.forEach(b => b.classList.toggle('active', b.dataset.role === papel));
    const pr = document.getElementById('painel-recuperar');
    if (pr) pr.style.display = 'none';
    if (painelCliente) painelCliente.style.display = papel === 'cliente' ? '' : 'none';
    if (painelDono) painelDono.style.display = papel === 'dono' ? '' : 'none';
    voltarAoInicio();
  }

  roleBtns.forEach(btn => {
    btn.addEventListener('click', () => mostrarPapel(btn.dataset.role));
  });

  /* ---------- tabs entrar / criar conta ---------- */
  function ligarTabs(prefixo, formEntrarId, formCadId) {
    const tE = document.getElementById(prefixo + '-entrar');
    const tC = document.getElementById(prefixo + '-criar');
    const fE = document.getElementById(formEntrarId);
    const fC = document.getElementById(formCadId);
    if (!tE || !tC || !fE || !fC) return;
    tE.addEventListener('click', () => {
      tE.classList.add('active'); tC.classList.remove('active');
      fE.style.display = ''; fC.style.display = 'none';
      voltarAoInicio();
    });
    tC.addEventListener('click', () => {
      tC.classList.add('active'); tE.classList.remove('active');
      fC.style.display = ''; fE.style.display = 'none';
      voltarAoInicio();
    });
  }
  ligarTabs('tab-cli', 'form-cli-login', 'form-cli-cadastro');
  ligarTabs('tab-dono', 'form-dono-login', 'form-dono-cadastro');

  /* ---------- etapa do código SMS (compartilhada) ---------- */
  const etapaCodigo = document.getElementById('etapa-codigo');
  const bannerCodigo = document.getElementById('banner-codigo');
  const infoFone = document.getElementById('codigo-info');
  const inputCodigo = document.getElementById('input-codigo');

  let fluxo = null; // {ident, payload}

  async function pedirCodigo(payload) {
    try {
      const res = Auth.requestCode(payload);
      fluxo = { ident: payload.phone, payload };
      mostrarEtapaCodigo(res);
    } catch (e) {
      showToast(msgErro(e), 'error');
    }
  }

  /* entrada */
  document.getElementById('form-cli-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pedirCodigo({
      phone: document.getElementById('cli-email-login').value,
      modo: 'login'
    });
  });

  document.getElementById('form-cli-cadastro')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pedirCodigo({
      phone: document.getElementById('cli-tel-cad').value,
      modo: 'registro',
      name: document.getElementById('cli-nome').value,
      email: document.getElementById('cli-email').value,
      role: 'cliente',
      aceite_privacidade: true
    });
  });

  document.getElementById('form-dono-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pedirCodigo({
      phone: document.getElementById('dono-email-login').value,
      modo: 'login'
    });
  });

  /* recuperar acesso */
  document.getElementById('form-recuperar')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pedirCodigo({
      phone: document.getElementById('recup-ident').value,
      modo: 'recuperar'
    });
  });

  document.getElementById('link-cli-recuperar')?.addEventListener('click', (e) => {
    e.preventDefault();
    abrirRecuperar();
  });
  document.getElementById('link-dono-recuperar')?.addEventListener('click', (e) => {
    e.preventDefault();
    abrirRecuperar();
  });
  document.getElementById('btn-voltar-recuperar')?.addEventListener('click', (e) => {
    e.preventDefault();
    fecharRecuperar();
  });

  document.getElementById('form-dono-cadastro')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pedirCodigo({
      phone: document.getElementById('cad-tel').value,
      modo: 'registro',
      name: document.getElementById('cad-nome-resp').value,
      salon_name: document.getElementById('cad-salao-nome').value,
      email: document.getElementById('cad-email').value,
      role: 'dono',
      aceite_privacidade: true
    });
  });

  /* verificar */
  document.getElementById('form-verificar-codigo')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!fluxo) return;
    try {
      const r = Auth.verifyCode(fluxo.ident, inputCodigo.value);
      showToast(r.user.role === 'dono'
        ? 'Bem-vindo de volta, ' + r.user.name.split(' ')[0] + '!'
        : 'Login realizado com sucesso!');
      setTimeout(() => { window.location.href = destinoPosLogin(r.user); }, 700);
    } catch (e) {
      showToast(msgErro(e), 'error');
      inputCodigo.select();
    }
  });

  /* reenviar (respeita cooldown de 30s da API) */
  document.getElementById('btn-reenviar')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!fluxo) return;
    pedirCodigo(fluxo.payload);
  });

  /* voltar */
  document.getElementById('btn-voltar-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    voltarAoInicio();
    const pr = document.getElementById('painel-recuperar');
    if (pr) pr.style.display = 'none';
    roleBtns.forEach(b => {
      if (b.classList.contains('active')) mostrarPapel(b.dataset.role);
    });
  });

  /* magic link: se URL tem ?token=, verificar automaticamente */
  (function() {
    var params = new URLSearchParams(window.location.search);
    var magicToken = params.get('token') || localStorage.getItem('cc_magic_token');
    if (magicToken) {
      localStorage.removeItem('cc_magic_token');
      try {
        var r = Auth.verificarMagicLink(magicToken);
        showToast('Login realizado via link mágico!');
        setTimeout(function() { window.location.href = destinoPosLogin(r.user); }, 500);
      } catch (e) {
        showToast(msgErro(e), 'error');
      }
    }
  })();
});
