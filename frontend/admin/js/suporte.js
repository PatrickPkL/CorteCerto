/* ============================================================
   Corte Certo – admin/js/suporte.js
   Tickets de atendimento (RF extra mantido da v1).
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const usuario = exigirLogin('dono');
  if (!usuario) return;
  const loja = Auth.salaoDoUsuario(usuario);
  if (!loja) {
    showToast('Nenhum salão vinculado a esta conta.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    return;
  }

  const form = document.getElementById('form-suporte');
  const tb = document.getElementById('tb-chamados');

  function badge(status) {
    const map = {
      aberto: ['badge-pendente', 'Aberto'],
      respondido: ['badge-confirmado', 'Respondido'],
      resolvido: ['badge-confirmado', 'Resolvido']
    };
    const [cls, txt] = map[status] || ['', status];
    return '<span class="badge ' + cls + '">' + esc(txt) + '</span>';
  }

  function renderChamados() {
    if (!tb) return;
    let chamados = [];
    try { chamados = API.ticketsDoSalao(loja.id); } catch (e) { /* noop */ }

    if (!chamados.length) {
      tb.innerHTML = '<tr><td colspan="4"><div class="empty-state"><h3>Nenhum chamado ainda</h3><p>Envie sua primeira mensagem pelo formulário acima.</p></div></td></tr>';
      return;
    }
    tb.innerHTML = chamados.map(c =>
      '<tr>' +
        '<td class="mono">' + DB.fmtDataBR(c.criadoEm) + '</td>' +
        '<td style="white-space:nowrap;">' + esc(c.assunto) + '</td>' +
        '<td style="max-width:420px;">' + esc(c.mensagem) + '</td>' +
        '<td>' + badge(c.status) + '</td>' +
      '</tr>'
    ).join('');
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const sel = document.getElementById('sup-assunto');
    const msg = document.getElementById('sup-mensagem');
    const texto = msg.value.trim();
    if (texto.length < 10) {
      showToast('Descreva sua mensagem com pelo menos 10 caracteres.', 'error');
      return;
    }
    try {
      API.criarTicket(loja.id, sel.options[sel.selectedIndex].text, texto);
      showToast('Mensagem enviada! Responderemos em até 24h úteis.');
      form.reset();
      renderChamados();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  renderChamados();
});
