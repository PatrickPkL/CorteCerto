/* ============================================================
   Corte Comigo – super-admin/js/super-admin.js
   Dashboard: estatísticas da plataforma.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  if (!saAuth.check()) return;

  var elTotalLojas = document.getElementById('stat-lojas');
  var elTotalUsers = document.getElementById('stat-users');
  var elAgendHoje = document.getElementById('stat-agendamentos');
  var elReceita = document.getElementById('stat-receita');
  var elTrial = document.getElementById('stat-trial');
  var elAtivas = document.getElementById('stat-ativas');
  var elConversao = document.getElementById('stat-conversao');
  var btnSair = document.getElementById('btn-sair');

  /* ---------- carregar dashboard ---------- */
  function carregarDashboard() {
    fetch('/api/super-admin/dashboard', { headers: saAuth.headers() })
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
        data = data.data || {};
        if (elTotalLojas) elTotalLojas.textContent = data.totalLojas || 0;
        if (elTotalUsers) elTotalUsers.textContent = data.totalUsuarios || 0;
        if (elAgendHoje) elAgendHoje.textContent = data.agendamentosHoje || 0;
        if (elReceita) elReceita.textContent = formatarMoeda(data.totalReceita || 0);
        if (elTrial) elTrial.textContent = data.lojasTrial || 0;
        if (elAtivas) elAtivas.textContent = data.lojasAtivas || 0;
        if (elConversao) {
          var trial = data.lojasTrial || 0;
          var ativas = data.lojasAtivas || 0;
          var base = trial + ativas;
          var pct = base > 0 ? (ativas / base) * 100 : 0;
          elConversao.textContent = pct.toFixed(1).replace('.', ',') + '%';
        }
      })
      .catch(function () {
        showToast('Erro ao carregar dashboard.', 'error');
      });
  }

  /* ---------- logout ---------- */
  if (btnSair) {
    btnSair.addEventListener('click', function (e) {
      e.preventDefault();
      saAuth.logout();
    });
  }

  /* ---------- formatador ---------- */
  function formatarMoeda(valor) {
    return 'R$ ' + Number(valor).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ---------- init ---------- */
  carregarDashboard();
});