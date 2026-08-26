/* ============================================================
   Corte Certo – super-admin/js/loja-detalhe.js
   Detalhe de loja individual: info, serviços, profissionais,
   agendamentos, plano e exclusão.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var params = new URLSearchParams(window.location.search);
  var lojaId = params.get('id');

  if (!lojaId) {
    window.location.href = 'index.html';
    return;
  }

  var elNomeLoja = document.getElementById('loja-nome');
  var elInfoSection = document.getElementById('section-info');
  var elServicos = document.getElementById('section-servicos');
  var elProfissionais = document.getElementById('section-profissionais');
  var elAgendStats = document.getElementById('section-agendamentos');
  var elPlanoStatus = document.getElementById('plano-status');
  var selectPlano = document.getElementById('select-plano');
  var btnSalvarPlano = document.getElementById('btn-salvar-plano');
  var btnExcluir = document.getElementById('btn-excluir');
  var btnVoltar = document.getElementById('btn-voltar');

  /* ---------- voltar ---------- */
  if (btnVoltar) {
    btnVoltar.addEventListener('click', function () {
      window.location.href = 'index.html';
    });
  }

  /* ---------- carregar dados da loja ---------- */
  function carregarLoja() {
    fetch('/api/super-admin/loja/' + lojaId, { headers: saAuth.headers() })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          saAuth.logout();
          return;
        }
        if (res.status === 404) {
          showToast('Loja não encontrada.', 'error');
          setTimeout(function () { window.location.href = 'index.html'; }, 1200);
          return;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || data.error) {
          if (data && data.error) showToast(data.error, 'error');
          return;
        }
        renderizarLoja(data);
      })
      .catch(function () {
        showToast('Erro ao carregar dados da loja.', 'error');
      });
  }

  /* ---------- renderizar ---------- */
  function renderizarLoja(loja) {
    if (elNomeLoja) elNomeLoja.textContent = loja.nome || loja.salon_name || 'Loja #' + lojaId;

    /* info */
    if (elInfoSection) {
      elInfoSection.innerHTML = '';
      var campos = [
        ['ID', loja.id],
        ['Nome', loja.nome || loja.salon_name || '—'],
        ['Cidade', loja.cidade || '—'],
        ['Telefone', loja.telefone || loja.phone || '—'],
        ['E-mail', loja.email || '—'],
        ['Owner', loja.owner_name || loja.owner || '—'],
        ['Criado em', loja.criado_em || loja.created_at || '—']
      ];
      campos.forEach(function (c) {
        var row = document.createElement('div');
        row.className = 'sa-info-row';
        var lbl = document.createElement('span');
        lbl.className = 'sa-info-label';
        lbl.textContent = c[0];
        var val = document.createElement('span');
        val.className = 'sa-info-value';
        val.textContent = c[1];
        row.appendChild(lbl);
        row.appendChild(val);
        elInfoSection.appendChild(row);
      });
    }

    /* serviços */
    if (elServicos) {
      elServicos.innerHTML = '';
      var servicos = loja.servicos || [];
      if (!servicos.length) {
        elServicos.textContent = 'Nenhum serviço cadastrado.';
      } else {
        var ulServ = document.createElement('ul');
        ulServ.className = 'sa-lista';
        servicos.forEach(function (s) {
          var li = document.createElement('li');
          li.textContent = (s.nome || s.name || 'Serviço') +
            (s.preco != null ? ' — R$ ' + Number(s.preco).toFixed(2).replace('.', ',') : '') +
            (s.duracao ? ' (' + s.duracao + ' min)' : '');
          ulServ.appendChild(li);
        });
        elServicos.appendChild(ulServ);
      }
    }

    /* profissionais */
    if (elProfissionais) {
      elProfissionais.innerHTML = '';
      var profs = loja.profissionais || loja.professionals || [];
      if (!profs.length) {
        elProfissionais.textContent = 'Nenhum profissional cadastrado.';
      } else {
        var ulProfs = document.createElement('ul');
        ulProfs.className = 'sa-lista';
        profs.forEach(function (p) {
          var li = document.createElement('li');
          li.textContent = p.nome || p.name || 'Profissional';
          ulProfs.appendChild(li);
        });
        elProfissionais.appendChild(ulProfs);
      }
    }

    /* agendamentos stats */
    if (elAgendStats) {
      elAgendStats.innerHTML = '';
      var stats = loja.agendamentos_stats || loja.stats || {};
      var items = [
        ['Hoje', stats.hoje || stats.today || 0],
        ['Semana', stats.semana || stats.week || 0],
        ['Mês', stats.mes || stats.month || 0],
        ['Total', stats.total || 0]
      ];
      items.forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'sa-stat-mini';
        var num = document.createElement('span');
        num.className = 'sa-stat-mini-num';
        num.textContent = item[1];
        var lbl = document.createElement('span');
        lbl.className = 'sa-stat-mini-lbl';
        lbl.textContent = item[0];
        div.appendChild(num);
        div.appendChild(lbl);
        elAgendStats.appendChild(div);
      });
    }

    /* plano */
    if (selectPlano) {
      var planoAtual = loja.plano || loja.plan || 'free';
      selectPlano.value = planoAtual;
      if (elPlanoStatus) elPlanoStatus.textContent = 'Plano atual: ' + planoAtual;
    }
  }

  /* ---------- salvar plano ---------- */
  if (btnSalvarPlano) {
    btnSalvarPlano.addEventListener('click', function () {
      var novoPlano = selectPlano ? selectPlano.value : 'free';
      btnSalvarPlano.disabled = true;
      btnSalvarPlano.textContent = 'Salvando...';

      fetch('/api/super-admin/loja/' + lojaId + '/plan', {
        method: 'PUT',
        headers: saAuth.headers(),
        body: JSON.stringify({ status: novoPlano })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.error) {
            showToast(data.error, 'error');
          } else {
            showToast('Plano atualizado com sucesso!');
            if (elPlanoStatus) elPlanoStatus.textContent = 'Plano atual: ' + novoPlano;
          }
          btnSalvarPlano.disabled = false;
          btnSalvarPlano.textContent = 'Salvar Plano';
        })
        .catch(function () {
          showToast('Erro ao salvar plano.', 'error');
          btnSalvarPlano.disabled = false;
          btnSalvarPlano.textContent = 'Salvar Plano';
        });
    });
  }

  /* ---------- excluir loja ---------- */
  if (btnExcluir) {
    btnExcluir.addEventListener('click', function () {
      var confirmado = confirm('Tem certeza que deseja excluir esta loja? Esta ação não pode ser desfeita.');
      if (!confirmado) return;

      btnExcluir.disabled = true;
      btnExcluir.textContent = 'Excluindo...';

      fetch('/api/super-admin/loja/' + lojaId, {
        method: 'DELETE',
        headers: saAuth.headers()
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.error) {
            showToast(data.error, 'error');
            btnExcluir.disabled = false;
            btnExcluir.textContent = 'Excluir Loja';
          } else {
            showToast('Loja excluída com sucesso!');
            setTimeout(function () { window.location.href = 'index.html'; }, 1000);
          }
        })
        .catch(function () {
          showToast('Erro ao excluir loja.', 'error');
          btnExcluir.disabled = false;
          btnExcluir.textContent = 'Excluir Loja';
        });
    });
  }

  /* ---------- init ---------- */
  carregarLoja();
});
