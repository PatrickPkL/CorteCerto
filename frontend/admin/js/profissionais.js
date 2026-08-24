/* ============================================================
   Corte Certo – admin/js/profissionais.js
   Equipe com horários próprios (DT-09), vínculo de serviços,
   limite por plano (RF-026/DT-12) e soft-delete (UC-09.4).
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

  const grid = document.getElementById('grid-profissionais');
  if (!grid) return;

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function servicosAtivos() {
    try { return API.servicosDaLoja(loja.id, true); } catch (e) { return []; }
  }

  function horarioDoProf(profId) {
    let linhas = [];
    try {
      linhas = API.horariosDaLoja(loja.id).filter(w =>
        w.professional_id === Number(profId) && w.is_open);
    } catch (e) { /* noop */ }
    if (!linhas.length) return 'Sem expediente definido';
    const dows = linhas.map(l => l.day_of_week).sort((a, b) => a - b);
    const ini = linhas[0].start_time;
    const fim = linhas[0].end_time;
    let txt = dows.map(d => DIAS[d]).join('/') + ' · ' + ini + '–' + fim;
    if (linhas[0].lunch_start && linhas[0].lunch_end) {
      txt += ' · almoço ' + linhas[0].lunch_start + '–' + linhas[0].lunch_end;
    }
    return txt;
  }

  function render() {
    let profs;
    try { profs = API.profissionaisDaLoja(loja.id, false); } catch (e) {
      showToast(msgErro(e), 'error');
      return;
    }

    grid.innerHTML = profs.map(p =>
      '<div class="card" data-id="' + p.id + '"' + (p.is_active ? '' : ' style="opacity:.55;"') + '>' +
        '<div class="prof-card-top">' +
          '<div class="user-avatar user-avatar-lg"' +
            (p.color ? ' style="background:' + esc(p.color) + '22;color:' + esc(p.color) + ';border-color:' + esc(p.color) + '66;"' : '') + '>' +
            esc(DB.iniciais(p.name)) + '</div>' +
          '<div>' +
            '<div class="prof-card-nome">' + esc(p.name) +
              (p.is_active ? '' : ' <span class="badge badge-pendente">Inativo</span>') + '</div>' +
            (p.phone ? '<div class="prof-card-esp mono">' + esc(p.phone) + '</div>' : '') +
            (p.bio ? '<div class="prof-card-esp">' + esc(p.bio) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="prof-card-horario">' + horarioDoProf(p.id) + '</div>' +
        (p.services.length
          ? '<div class="prof-card-servicos">' + p.services.map(s =>
              '<span class="chip">' + esc(s.name) + '</span>').join('') + '</div>'
          : '') +
        '<button class="btn btn-outline btn-prof-editar" data-id="' + p.id + '">Editar</button> ' +
        (p.is_active
          ? '<button class="btn btn-danger btn-prof-desativar" data-id="' + p.id + '">Excluir</button>'
          : '<button class="btn btn-outline btn-prof-reativar" data-id="' + p.id + '">Reativar</button>') +
      '</div>'
    ).join('') ||
    '<div class="empty-state" style="grid-column:1/-1;"><h3>Nenhum profissional</h3><p>Cadastre o primeiro membro da equipe.</p></div>';
  }

  function preencherServicos(containerId, selecionados) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const sel = new Set((selecionados || []).map(Number));
    box.innerHTML = servicosAtivos().map(s =>
      '<label class="check-inline">' +
        '<input type="checkbox" value="' + s.id + '"' + (sel.has(s.id) ? ' checked' : '') + '> ' +
        esc(s.name) + '</label>'
    ).join('');
  }

  function coletarServicos(containerId) {
    return Array.from(
      document.getElementById(containerId)?.querySelectorAll('input:checked') || []
    ).map(i => Number(i.value));
  }

  grid.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-prof-editar');
    const offBtn = e.target.closest('.btn-prof-desativar');
    const onBtn = e.target.closest('.btn-prof-reativar');

    if (editBtn) {
      let prof = null;
      let linha = {};
      try {
        prof = API.profissionaisDaLoja(loja.id, false)
          .find(p => String(p.id) === editBtn.dataset.id);
        linha = prof ? (API.horariosDaLoja(loja.id)
          .find(w => w.professional_id === prof.id && w.day_of_week === 1) || {}) : {};
      } catch (err2) {
        showToast(msgErro(err2), 'error');
        return;
      }
      if (!prof) return;

      document.getElementById('ep-id').value = prof.id;
      document.getElementById('ep-nome').value = prof.name;
      document.getElementById('ep-telefone').value = prof.phone || '';
      document.getElementById('ep-cor').value = prof.color || '#3b82f6';
      document.getElementById('ep-bio').value = prof.bio || '';
      document.getElementById('ep-inicio').value = linha.start_time || '09:00';
      document.getElementById('ep-fim').value = linha.end_time || '19:00';
      document.getElementById('ep-almoco-ini').value = linha.lunch_start || '';
      document.getElementById('ep-almoco-fim').value = linha.lunch_end || '';
      preencherServicos('ep-servicos', prof.services.map(s => s.id));
      abrirModal(document.getElementById('modal-editar-profissional'));
    }

    if (offBtn) {
      if (!confirm('Remover este profissional da equipe? O histórico é preservado.')) return;
      try {
        API.desativarProfissional(offBtn.dataset.id);
        showToast('Profissional removido da equipe.', 'error');
        render();
      } catch (err2) {
        showToast(msgErro(err2), 'error');
      }
    }

    if (onBtn) {
      try {
        API.atualizarProfissional(onBtn.dataset.id, { is_active: true });
        showToast('Profissional reativado!');
        render();
      } catch (err2) {
        showToast(msgErro(err2), 'error');
      }
    }
  });

  /* ---------- novo ---------- */
  setupModal('btn-novo-profissional', 'modal-profissional', 'btn-fechar-modal-profissional');

  document.getElementById('form-profissional')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      API.criarProfissional({
        name: document.getElementById('pf-nome').value,
        phone: document.getElementById('pf-telefone').value,
        email: document.getElementById('pf-email').value,
        color: document.getElementById('pf-cor').value,
        bio: document.getElementById('pf-bio').value,
        start_time: document.getElementById('pf-inicio').value || '09:00',
        end_time: document.getElementById('pf-fim').value || '19:00',
        lunch_start: document.getElementById('pf-almoco-ini').value || null,
        lunch_end: document.getElementById('pf-almoco-fim').value || null,
        service_ids: coletarServicos('pf-servicos')
      });
      fecharModal(document.getElementById('modal-profissional'));
      e.target.reset();
      preencherServicos('pf-servicos', []);
      showToast('Profissional cadastrado!');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  /* ---------- editar ---------- */
  document.getElementById('btn-fechar-modal-editar-profissional')?.addEventListener('click', () =>
    fecharModal(document.getElementById('modal-editar-profissional')));
  document.getElementById('modal-editar-profissional')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-editar-profissional')) fecharModal(e.target);
  });

  document.getElementById('form-editar-profissional')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      API.atualizarProfissional(document.getElementById('ep-id').value, {
        name: document.getElementById('ep-nome').value,
        phone: document.getElementById('ep-telefone').value,
        color: document.getElementById('ep-cor').value,
        bio: document.getElementById('ep-bio').value,
        start_time: document.getElementById('ep-inicio').value || '09:00',
        end_time: document.getElementById('ep-fim').value || '19:00',
        lunch_start: document.getElementById('ep-almoco-ini').value || null,
        lunch_end: document.getElementById('ep-almoco-fim').value || null,
        service_ids: coletarServicos('ep-servicos')
      });
      fecharModal(document.getElementById('modal-editar-profissional'));
      showToast('Profissional atualizado!');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  preencherServicos('pf-servicos', []);
  render();
});
