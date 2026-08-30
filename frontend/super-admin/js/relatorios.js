/* ============================================================
   Corte Certo – super-admin/js/relatorios.js
   Página de Relatórios: cards por período, planos, top 10 lojas
   por receita e atividade recente (logins).
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var elPeriodo = document.getElementById('sa-periodo');
  var elReceita = document.getElementById('stat-receita');
  var elLojas = document.getElementById('stat-lojas');
  var elUsuarios = document.getElementById('stat-usuarios');
  var elAgendamentos = document.getElementById('stat-agendamentos');
  var tbodyPlanos = document.getElementById('tbody-planos');
  var tbodyTop = document.getElementById('tbody-top');
  var atividadeEl = document.getElementById('atividade-recente');
  var btnSair = document.getElementById('btn-sair');

  var dadosRelatorio = null;

  /* ---------- carregar relatorios ---------- */
  function carregar() {
    fetch('/api/super-admin/relatorios', { headers: saAuth.headers() })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          saAuth.logout();
          return;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (data.error) {
          showToast(data.error, 'error');
          return;
        }
        dadosRelatorio = data;
        renderizarTudo();
      })
      .catch(function () {
        showToast('Erro ao carregar relatórios.', 'error');
      });
  }

  /* ---------- cards por período ---------- */
  function renderizarCards() {
    var periodo = elPeriodo ? elPeriodo.value : 'd30';
    var pp = (dadosRelatorio && dadosRelatorio.por_periodo) || {};

    var receita = (pp.receita && pp.receita[periodo]) || 0;
    var lojas = (pp.novas_lojas && pp.novas_lojas[periodo]) || 0;
    var usuarios = (pp.novos_usuarios && pp.novos_usuarios[periodo]) || 0;
    var ags = (pp.agendamentos && pp.agendamentos[periodo]) || 0;

    if (elReceita) elReceita.textContent = formatarMoeda(receita);
    if (elLojas) elLojas.textContent = lojas;
    if (elUsuarios) elUsuarios.textContent = usuarios;
    if (elAgendamentos) elAgendamentos.textContent = ags;
  }

  /* ---------- assinaturas por plano ---------- */
  function renderizarPlanos() {
    if (!tbodyPlanos) return;
    tbodyPlanos.innerHTML = '';
    var planos = (dadosRelatorio && dadosRelatorio.planos) || [];

    if (!planos.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'sa-vazio';
      td.textContent = 'Nenhum plano cadastrado.';
      tr.appendChild(td);
      tbodyPlanos.appendChild(tr);
      return;
    }

    planos.forEach(function (p) {
      var tr = document.createElement('tr');

      var tdPlano = document.createElement('td');
      tdPlano.textContent = p.name || p.nome || '—';

      var tdPreco = document.createElement('td');
      tdPreco.textContent = formatarMoeda(p.price_monthly || 0);

      var tdTotal = document.createElement('td');
      tdTotal.textContent = p.total || 0;

      var tdAtivas = document.createElement('td');
      tdAtivas.textContent = p.ativas || 0;

      var tdTrial = document.createElement('td');
      tdTrial.textContent = p.trial || 0;

      var tdCanceladas = document.createElement('td');
      tdCanceladas.textContent = p.canceladas || 0;

      tr.appendChild(tdPlano);
      tr.appendChild(tdPreco);
      tr.appendChild(tdTotal);
      tr.appendChild(tdAtivas);
      tr.appendChild(tdTrial);
      tr.appendChild(tdCanceladas);
      tbodyPlanos.appendChild(tr);
    });
  }

  /* ---------- top 10 lojas por receita ---------- */
  function renderizarTop() {
    if (!tbodyTop) return;
    tbodyTop.innerHTML = '';
    var top = (dadosRelatorio && dadosRelatorio.top10_lojas) || [];

    if (!top.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'sa-vazio';
      td.textContent = 'Nenhuma loja com receita no período.';
      tr.appendChild(td);
      tbodyTop.appendChild(tr);
      return;
    }

    top.forEach(function (l, idx) {
      var tr = document.createElement('tr');

      var tdRank = document.createElement('td');
      tdRank.textContent = idx + 1;

      var tdNome = document.createElement('td');
      tdNome.textContent = l.nome || l.name || '—';

      var tdCidade = document.createElement('td');
      tdCidade.textContent = l.cidade || l.city || '—';

      var tdPlano = document.createElement('td');
      var planoTxt = l.plano || 'nenhum';
      var spanPlano = document.createElement('span');
      spanPlano.textContent = planoTxt;
      spanPlano.className = 'badge badge-' + (l.status || 'nenhum');
      tdPlano.appendChild(spanPlano);

      var tdReceita = document.createElement('td');
      tdReceita.textContent = formatarMoeda(l.receita || 0);

      var tdAg = document.createElement('td');
      tdAg.textContent = l.agendamentos || 0;

      tr.appendChild(tdRank);
      tr.appendChild(tdNome);
      tr.appendChild(tdCidade);
      tr.appendChild(tdPlano);
      tr.appendChild(tdReceita);
      tr.appendChild(tdAg);
      tbodyTop.appendChild(tr);
    });
  }

  /* ---------- atividade recente ---------- */
  function renderizarAtividade() {
    if (!atividadeEl) return;
    atividadeEl.innerHTML = '';
    var ativ = (dadosRelatorio && dadosRelatorio.atividade_recente) || [];

    if (!ativ.length) {
      var vazio = document.createElement('div');
      vazio.className = 'sa-vazio';
      vazio.textContent = 'Nenhum login registrado.';
      atividadeEl.appendChild(vazio);
      return;
    }

    ativ.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'sa-atividade-row';

      var data = document.createElement('span');
      data.className = 'sa-atividade-data';
      data.textContent = a.timestamp ? formatarData(a.timestamp) : '—';

      var nome = document.createElement('span');
      nome.className = 'sa-atividade-nome';
      nome.textContent = a.nome || '—';

      var email = document.createElement('span');
      email.className = 'sa-atividade-email';
      email.textContent = a.email || '—';

      var papel = document.createElement('span');
      papel.className = 'sa-atividade-papel';
      if (a.papel) {
        var badge = document.createElement('span');
        badge.className = 'badge badge-' + a.papel;
        badge.textContent = a.papel;
        papel.appendChild(badge);
      }

      row.appendChild(data);
      row.appendChild(nome);
      row.appendChild(email);
      row.appendChild(papel);
      atividadeEl.appendChild(row);
    });
  }

  /* ---------- render tudo ---------- */
  function renderizarTudo() {
    renderizarCards();
    renderizarPlanos();
    renderizarTop();
    renderizarAtividade();
  }

  /* ---------- trocar período ---------- */
  if (elPeriodo) elPeriodo.addEventListener('change', renderizarCards);

  /* ---------- logout ---------- */
  if (btnSair) {
    btnSair.addEventListener('click', function (e) {
      e.preventDefault();
      saAuth.logout();
    });
  }

  /* ---------- formatadores ---------- */
  function formatarMoeda(valor) {
    return 'R$ ' + Number(valor).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function formatarData(valor) {
    var d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    return d.toLocaleString('pt-BR');
  }

  /* ---------- init ---------- */
  carregar();
});
