/* ============================================================
   Corte Certo – admin/js/login.js
   Autenticação por telefone OU e-mail + código de verificação
   (RF-001..005, DT-13). Requer db.js, auth.js, local-api.js e
   shared.js antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- seletor de papel ---------- */
  const roleBtns = document.querySelectorAll('.role-btn');
  const painelCliente = document.getElementById('painel-cliente');
  const painelDono = document.getElementById('painel-dono');

  function mostrarPapel(papel) {
    roleBtns.forEach(b => b.classList.toggle('active', b.dataset.role === papel));
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

  /* ---------- etapa do código (compartilhada) ---------- */
  const etapaCodigo = document.getElementById('etapa-codigo');
  const bannerCodigo = document.getElementById('banner-codigo');
  const infoFone = document.getElementById('codigo-info');
  const inputCodigo = document.getElementById('input-codigo');

  let fluxo = null; // {phone, ident, payload}

  function voltarAoInicio() {
    if (etapaCodigo) etapaCodigo.style.display = 'none';
    fluxo = null;
    if (inputCodigo) inputCodigo.value = '';
  }

  function mostrarEtapaCodigo(res) {
    document.querySelectorAll('#painel-cliente form, #painel-dono form').forEach(f => {
      f.style.display = 'none';
    });
    if (bannerCodigo) {
      bannerCodigo.hidden = false;
      bannerCodigo.innerHTML = '<strong>Verifique seu e-mail</strong> — você recebeu um código de 6 dígitos.';
    }
    if (infoFone) {
      const destinoRegistro = (fluxo && fluxo.payload && fluxo.payload.modo === 'registro' && fluxo.payload.email)
        ? String(fluxo.payload.email).trim() : '';
      infoFone.textContent = 'Digite o código de 6 dígitos enviado para ' +
        (destinoRegistro ? destinoRegistro : String(fluxo && fluxo.ident ? fluxo.ident : '').trim()) + '.';
    }
    if (etapaCodigo) etapaCodigo.style.display = '';
    if (inputCodigo) inputCodigo.focus();
  }

  function abrirRecuperar() {
    if (painelCliente) painelCliente.style.display = 'none';
    if (painelDono) painelDono.style.display = 'none';
    const pr = document.getElementById('painel-recuperar');
    if (pr) pr.style.display = '';
    voltarAoInicio();
  }

  function fecharRecuperar() {
    const pr = document.getElementById('painel-recuperar');
    if (pr) pr.style.display = 'none';
    roleBtns.forEach(b => {
      if (b.classList.contains('active')) mostrarPapel(b.dataset.role);
    });
  }

  async function pedirCodigo(payload) {
    try {
      const res = Auth.requestCode(payload);
      fluxo = {
        phone: payload.email || payload.phone,
        ident: payload.email || payload.phone,
        payload
      };
      mostrarEtapaCodigo(res);
    } catch (e) {
      showToast(msgErro(e), 'error');
    }
  }

  /* entrada */
  document.getElementById('form-cli-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pedirCodigo({
      email: document.getElementById('cli-email-login').value,
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
      phone: document.getElementById('dono-tel').value,
      modo: 'login'
    });
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
      const r = Auth.verifyCode(fluxo.phone, inputCodigo.value);
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
    roleBtns.forEach(b => {
      if (b.classList.contains('active')) mostrarPapel(b.dataset.role);
    });
  });

  /* ---------- recuperar acesso por e-mail ---------- */
  const etapaRecuperar = document.getElementById('etapa-recuperar');
  const formRecuperar = document.getElementById('form-recuperar');
  const btnVoltarRec = document.getElementById('btn-voltar-recuperar');

  function mostrarRecuperar() {
    voltarAoInicio();
    document.querySelectorAll('#painel-cliente form, #painel-dono form').forEach(f => {
      f.style.display = 'none';
    });
    if (etapaRecuperar) etapaRecuperar.style.display = '';
    const inp = document.getElementById('input-rec-email');
    if (inp) inp.focus();
  }

  document.querySelectorAll('.recuperar-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      mostrarRecuperar();
    });
  });

  btnVoltarRec?.addEventListener('click', e => {
    e.preventDefault();
    voltarAoInicio();
    roleBtns.forEach(b => {
      if (b.classList.contains('active')) mostrarPapel(b.dataset.role);
    });
  });

  formRecuperar?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('input-rec-email').value.trim();
    try {
      API.recuperarAcesso(email);
      showToast('Se o e-mail estiver cadastrado, você recebeu um link de acesso no seu e-mail.', 'success');
      formRecuperar.reset();
      btnVoltarRec?.click();
    } catch (erro) {
      showToast(msgErro(erro), 'error');
    }
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
