/* ============================================================
   Corte Certo – super-admin/js/bot-sa.js
   Bot atendente (super-admin): config, verificação, simulação
   e histórico via REST /api/super-admin/bot*.
   Requer super-auth.js carregado antes.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  saAuth.check();

  var el = {
    sw: document.getElementById('bot-switch'),
    modo: document.getElementById('bot-modo'),
    ia: document.getElementById('bot-ia'),
    estado: document.getElementById('bot-estado'),
    gmail: document.getElementById('bot-gmail'),
    statTotal: document.getElementById('stat-total'),
    statResp: document.getElementById('stat-resp'),
    statEnc: document.getElementById('stat-enc'),
    cfgForward: document.getElementById('cfg-forward'),
    cfgNome: document.getElementById('cfg-nome'),
    cfgSegundos: document.getElementById('cfg-segundos'),
    tb: document.getElementById('tb-historico'),
    resultado: document.getElementById('result-teste')
  };

  function badge(txt, cls) {
    return '<span class="badge ' + (cls || '') + '">' + esc(txt) + '</span>';
  }

  function decisaoBadge(d) {
    switch (d) {
      case 'responder': return badge('Respondido', 'badge-ativo');
      case 'encaminhar': return badge('Redirecionado', 'badge-neutro');
      case 'ignorar': return badge('Ignorado', 'badge-inativo');
      default: return badge('—');
    }
  }

  function api(url, opcoes) {
    return fetch(url, Object.assign({ headers: saAuth.headers() }, opcoes))
      .then(function (res) {
        if (res.status === 401 || res.status === 403) saAuth.logout();
        return res.json();
      })
      .then(function (data) {
        if (!data) throw new Error('Sem resposta do servidor.');
        if (data.error) {
          var err = new Error(data.error);
          err.status = data.status;
          throw err;
        }
        return data.data;
      });
  }

  function fmtData(valor) {
    if (!valor) return '—';
    return String(valor).replace('T', ' ').slice(0, 16).replace('T', ' ');
  }

  /* ---------- estado / config ---------- */
  function carregarEstado() {
    api('/api/super-admin/bot')
      .then(function (cfg) {
        el.sw.checked = !!cfg.enabled;
        el.estado.textContent = cfg.enabled ? 'Ativo' : 'Inativo';
        el.estado.className = 'badge ' + (cfg.enabled ? 'badge-ativo' : 'badge-inativo');
        el.modo.textContent = cfg.mode === 'real' ? 'Modo real (Gmail conectado)' : 'Modo demonstração';
        el.modo.className = 'badge ' + (cfg.mode === 'real' ? 'badge-ativo' : 'badge-neutro');

        var ia = cfg.gemini || {};
        el.ia.textContent = ia.configurado
          ? 'IA Gemini ativa (' + (ia.modelo || '—') + ')'
          : 'Sem GEMINI_API_KEY — classificação por palavras-chave';
        el.ia.className = 'badge ' + (ia.configurado ? 'badge-ia' : 'badge-inativo');

        el.gmail.innerHTML = cfg.mode === 'real'
          ? 'Caixa monitorada: <strong>' + esc(cfg.gmailUser) + '</strong>' +
            (cfg.ultimaVerificacao ? ' · última verificação: ' + esc(fmtData(String(cfg.ultimaVerificacao).slice(0, 16))) : '') +
            ' · encaminhar para: <strong>' + esc(cfg.forwardTo) + '</strong>'
          : 'Sem GMAIL_USER/GMAIL_PASS no .env — o bot roda em modo demonstração (nada é enviado). Coloque as credenciais para ativar o modo real.';

        el.statTotal.textContent = String(cfg.totalProcessadas);
        el.statResp.textContent = String(cfg.totalRespondidas);
        el.statEnc.textContent = String(cfg.totalEncaminhadas);

        if (!document.activeElement || document.activeElement.id !== 'cfg-forward') el.cfgForward.value = cfg.forwardTo;
        if (!document.activeElement || document.activeElement.id !== 'cfg-nome') el.cfgNome.value = cfg.assistantName || '';
        if (!document.activeElement || document.activeElement.id !== 'cfg-segundos') el.cfgSegundos.value = cfg.seconds;
      })
      .catch(function (e) {
        showToast(e.message || 'Erro ao carregar configuração.', 'error');
      });
  }

  /* ---------- histórico ---------- */
  function renderHistorico() {
    api('/api/super-admin/bot/historico')
      .then(function (hist) {
        if (!hist.length) {
          el.tb.innerHTML = '<tr><td colspan="5" class="sa-vazio">Nenhuma mensagem ainda.</td></tr>';
          return;
        }
        el.tb.innerHTML = hist.map(function (h) {
          return '<tr>' +
            '<td class="sa-data">' + esc(fmtData(String(h.ts).slice(0, 16))) + '</td>' +
            '<td style="white-space:nowrap;">' + esc(h.nome || h.de || '—') + '<br><span style="font-size:12px;color:#888;">' + esc(h.de) + '</span></td>' +
            '<td class="sa-msg-trunc">' + esc(h.assunto || '') + '</td>' +
            '<td>' + decisaoBadge(h.decisao) + (h.simulado ? '<br><span style="font-size:11px;color:#888;">simulado</span>' : '') + '</td>' +
            '<td style="max-width:320px;font-size:13px;color:#888;">' +
              esc(h.motivo || '') +
              (h.motor ? '<br><span style="font-size:11px;">motor: <strong>' + esc(h.motor) + '</strong></span>' : '') +
              (h.destino ? '<br><span style="color:#f0f0f0;">' + esc(h.destino) + '</span>' : '') +
              (h.erro ? '<br><span style="color:#e74c3c;">' + esc(h.erro) + '</span>' : '') +
            '</td>' +
          '</tr>';
        }).join('');
      })
      .catch(function (e) {
        showToast(e.message || 'Erro ao carregar histórico.', 'error');
      });
  }

  function recarregarTudo() {
    carregarEstado();
    renderHistorico();
  }

  /* ---------- ativação ---------- */
  if (el.sw) {
    el.sw.addEventListener('change', function () {
      api('/api/super-admin/bot', {
        method: 'PUT',
        body: JSON.stringify({ enabled: el.sw.checked })
      })
        .then(function (r) {
          showToast(r.enabled ? 'Bot ativado. Ele já começa a monitorar a caixa.' : 'Bot desativado.');
          recarregarTudo();
        })
        .catch(function (e) {
          el.sw.checked = !el.sw.checked;
          showToast(e.message || 'Erro ao alterar o bot.', 'error');
        });
    });
  }

  /* ---------- configuração ---------- */
  document.getElementById('form-config').addEventListener('submit', function (e) {
    e.preventDefault();
    api('/api/super-admin/bot', {
      method: 'PUT',
      body: JSON.stringify({
        forwardTo: el.cfgForward.value.trim(),
        assistantName: el.cfgNome.value.trim(),
        seconds: parseInt(el.cfgSegundos.value, 10)
      })
    })
      .then(function () {
        showToast('Configuração salva.');
        recarregarTudo();
      })
      .catch(function (err2) { showToast(err2.message || 'Erro ao salvar.', 'error'); });
  });

  /* ---------- simulador ---------- */
  var quick = {
    preco: ['Quanto custa um corte?', 'Oi! Quanto custa um corte de cabelo no salão de vocês?'],
    horario: ['Horário de funcionamento', 'Que horas vocês abrem? Funciona aos domingos?'],
    agendar: ['Quero agendar', 'Quero marcar um corte para amanhã às 15h, tem vaga?']
  };

  document.querySelectorAll('[data-quick]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var q = quick[btn.getAttribute('data-quick')];
      if (!q) return;
      document.getElementById('test-subject').value = q[0];
      document.getElementById('test-text').value = q[1];
    });
  });

  function iframePreview(html) {
    var frame = document.createElement('iframe');
    frame.srcdoc = html || '';
    frame.style.cssText = 'width:100%;height:400px;border:1px solid #333;border-radius:8px;background:#ffffff;margin-top:6px;';
    frame.setAttribute('loading', 'lazy');
    return frame;
  }

  document.getElementById('form-teste').addEventListener('submit', function (e) {
    e.preventDefault();

    api('/api/super-admin/bot/testar', {
      method: 'POST',
      body: JSON.stringify({
        from: document.getElementById('test-from').value.trim(),
        subject: document.getElementById('test-subject').value.trim(),
        text: document.getElementById('test-text').value.trim()
      })
    })
      .then(function (r) {
        var div = el.resultado;
        div.hidden = false;
        div.innerHTML = '';

        var cab = '<div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            decisaoBadge(r.decisao) +
            (r.simulado ? badge('Simulação (nada enviado)', 'badge-neutro') : badge('Envio real', 'badge-ativo')) +
          '</div>' +
          '<p style="margin:10px 0 0;color:#888;font-size:13px;">' + esc(r.motivo || '') + ' ' +
            (r.categorias && r.categorias.length ? '— categorias: <strong>' + esc(r.categorias.join(', ')) + '</strong>' : '') +
            (r.motor ? ' — motor: <strong>' + esc(r.motor) + '</strong>' : '') +
          '</p>' +
          (r.destino ? '<p style="margin:6px 0 0;font-size:13px;">' + esc(r.destino) + '</p>' : '') +
          (r.erro ? '<p style="margin-top:8px;color:#e74c3c;">' + esc(r.erro) + '</p>' : '') +
        '</div>';

        var titulo = document.createElement('div');
        titulo.style.cssText = 'margin-top:14px;font-weight:600;color:#b8863b;';
        titulo.textContent = r.decisao === 'responder' ? 'E-mail que o bot enviaria' : 'Aviso enviado ao cliente';

        div.insertAdjacentHTML('beforeend', cab);
        div.appendChild(titulo);
        div.appendChild(iframePreview(r.decisao === 'responder' ? r.respostaHtml : r.avisoHtml));

        if (r.decisao === 'encaminhar') {
          var enc = document.createElement('p');
          enc.style.cssText = 'color:#888;font-size:13px;margin:10px 0 0;';
          enc.textContent = 'Além disso, a mensagem original foi encaminhada para o atendente da empresa, que responde em seguida.';
          div.appendChild(enc);
        }
      })
      .catch(function (err2) { showToast(err2.message || 'Erro ao testar.', 'error'); });
  });

  /* ---------- ações ---------- */
  document.getElementById('btn-verificar').addEventListener('click', function () {
    document.getElementById('btn-verificar').disabled = true;
    api('/api/super-admin/bot/verificar', { method: 'POST', body: JSON.stringify({}) })
      .then(function (r) {
        showToast((r && r.mensagem) || 'Verificação concluída.');
        recarregarTudo();
      })
      .catch(function (e) { showToast(e.message || 'Erro na verificação.', 'error'); })
      .then(function () { document.getElementById('btn-verificar').disabled = false; });
  });

  document.getElementById('btn-limpar').addEventListener('click', function () {
    if (!confirm('Apagar todo o histórico do bot?')) return;
    api('/api/super-admin/bot/historico', { method: 'DELETE' })
      .then(function () { showToast('Histórico apagado.'); renderHistorico(); })
      .catch(function (e) { showToast(e.message || 'Erro ao limpar.', 'error'); });
  });

  document.getElementById('btn-refresh').addEventListener('click', renderHistorico);

  /* ---------- logout ---------- */
  document.getElementById('btn-sair').addEventListener('click', function (e) {
    e.preventDefault();
    saAuth.logout();
  });

  recarregarTudo();
});