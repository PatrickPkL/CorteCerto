/* ============================================================
   Corte Certo – admin/js/servicos.js
   CRUD de serviços com validações da API (RF-018..021).
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

  const tbody = document.getElementById('tbody-servicos');
  if (!tbody) return;

  function render() {
    let servicos;
    try { servicos = API.servicosDaLoja(loja.id, false); } catch (e) {
      showToast(msgErro(e), 'error');
      return;
    }

    tbody.innerHTML = servicos.map(s =>
      '<tr data-id="' + s.id + '">' +
        '<td>' + esc(s.name) +
          (s.category ? '<br><small style="color:var(--text-muted)">' + esc(s.category) + '</small>' : '') + '</td>' +
        '<td class="mono">' + s.duration_min + ' min</td>' +
        '<td class="mono">' + DB.fmtBRL(s.price) + '</td>' +
        '<td>' + (s.active
          ? '<span class="badge badge-confirmado">Ativo</span>'
          : '<span class="badge badge-pendente">Inativo</span>') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn btn-outline btn-svc-editar" data-id="' + s.id + '">Editar</button> ' +
          '<button class="btn btn-outline btn-svc-toggle" data-id="' + s.id + '">' +
            (s.active ? 'Desativar' : 'Ativar') + '</button> ' +
          '<button class="btn btn-danger btn-svc-excluir" data-id="' + s.id + '">Excluir</button>' +
        '</td>' +
      '</tr>'
    ).join('') ||
    '<tr><td colspan="5"><div class="empty-state"><h3>Nenhum serviço cadastrado</h3><p>Cadastre o primeiro serviço do catálogo.</p></div></td></tr>';
  }

  tbody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-svc-editar');
    const toggleBtn = e.target.closest('.btn-svc-toggle');
    const delBtn = e.target.closest('.btn-svc-excluir');

    if (editBtn) {
      const svc = buscarServico(editBtn.dataset.id);
      if (!svc) return;
      document.getElementById('es-id').value = svc.id;
      document.getElementById('es-nome').value = svc.name;
      document.getElementById('es-categoria').value = svc.category || 'Cabelo';
      document.getElementById('es-duracao').value = svc.duration_min;
      document.getElementById('es-preco').value = svc.price;
      document.getElementById('es-descricao').value = svc.description || '';
      abrirModal(document.getElementById('modal-editar-servico'));
    }

    if (toggleBtn) {
      const svc = buscarServico(toggleBtn.dataset.id);
      if (!svc) return;
      try {
        API.atualizarServico(toggleBtn.dataset.id, { active: !svc.active });
        showToast(svc.active ? 'Serviço desativado.' : 'Serviço ativado.',
          svc.active ? 'error' : 'success');
        render();
      } catch (err2) {
        showToast(msgErro(err2), 'error');
      }
    }

    if (delBtn) {
      if (!confirm('Excluir este serviço? Agendamentos antigos mantêm o registro original.')) return;
      try {
        API.excluirServico(delBtn.dataset.id);
        showToast('Serviço excluído.', 'error');
        render();
      } catch (err2) {
        showToast(msgErro(err2), 'error');
      }
    }
  });

  function buscarServico(id) {
    return API.servicosDaLoja(loja.id, false).find(s => String(s.id) === String(id)) || null;
  }

  /* ---------- novo ---------- */
  setupModal('btn-novo-servico', 'modal-servico', 'btn-fechar-modal-servico');
  document.getElementById('form-servico')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      API.criarServico({
        name: document.getElementById('sv-nome').value,
        category: document.getElementById('sv-categoria').value,
        duration_min: Number(document.getElementById('sv-duracao').value),
        price: Number(document.getElementById('sv-preco').value),
        description: document.getElementById('sv-descricao').value
      });
      fecharModal(document.getElementById('modal-servico'));
      e.target.reset();
      showToast('Serviço cadastrado!');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  /* ---------- editar ---------- */
  document.getElementById('btn-fechar-modal-editar-servico')?.addEventListener('click', () =>
    fecharModal(document.getElementById('modal-editar-servico')));
  document.getElementById('modal-editar-servico')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-editar-servico')) fecharModal(e.target);
  });

  document.getElementById('form-editar-servico')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      API.atualizarServico(document.getElementById('es-id').value, {
        name: document.getElementById('es-nome').value,
        category: document.getElementById('es-categoria').value,
        duration_min: Number(document.getElementById('es-duracao').value),
        price: Number(document.getElementById('es-preco').value),
        description: document.getElementById('es-descricao').value
      });
      fecharModal(document.getElementById('modal-editar-servico'));
      showToast('Serviço atualizado!');
      render();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
    }
  });

  render();
});
