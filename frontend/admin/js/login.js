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

  /* ---------- etapa do código SMS (compartilhada) ---------- */
  const etapaCodigo = document.getElementById('etapa-codigo');
  const bannerCodigo = document.getElementById('banner-codigo');
  const infoFone = document.getElementById('codigo-info');
  const inputCodigo = document.getElementById('input-codigo');

  let fluxo = null; // {phone, payload}

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
      bannerCodigo.innerHTML =
        '<strong>Modo demonstração</strong> — seu código de verificação é: ' +
        '<span class="mono codigo-demo">' + esc(res.demo_code) + '</span>';
    }
    if (infoFone) {
      infoFone.textContent = 'Digite o código de 6 dígitos enviado para ' +
        String(fluxo.phone || '').trim() + '.';
    }
    if (etapaCodigo) etapaCodigo.style.display = '';
    if (inputCodigo) inputCodigo.focus();
  }

  async function pedirCodigo(payload) {
    try {
      const res = Auth.requestCode(payload);
      fluxo = { phone: payload.phone, payload };
      mostrarEtapaCodigo(res);
    } catch (e) {
      showToast(msgErro(e), 'error');
    }
  }

  /* entrada */
  document.getElementById('form-cli-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pedirCodigo({
      phone: document.getElementById('cli-tel').value,
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
      role: 'cliente'
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
      role: 'dono'
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
});
