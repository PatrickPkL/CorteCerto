/* ============================================================
   Corte Certo – admin/js/bot.js
   Painel do Atendente automático de e-mail (bot).
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const usuario = exigirLogin('dono');
  if (!usuario) return;

  const el = {
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
      case 'responder': return badge('Respondido', 'badge-confirmado');
      case 'encaminhar': return badge('Redirecionado', 'badge-pendente');
      case 'ignorar': return badge('Ignorado', 'badge-neutro');
      default: return badge('—');
    }
  }

  function carregarEstado() {
    let cfg = null;
    try { cfg = API.botConfig(); } catch (e) { showToast(msgErro(e), 'error'); return; }

    el.sw.checked = !!cfg.enabled;
    el.estado.textContent = cfg.enabled ? 'Ativo' : 'Inativo';
    el.estado.className = 'badge ' + (cfg.enabled ? 'badge-confirmado' : 'badge-pendente');
    el.modo.textContent = cfg.mode === 'real' ? 'Modo real (Gmail conectado)' : 'Modo demonstração';
    el.modo.className = 'badge ' + (cfg.mode === 'real' ? 'badge-confirmado' : 'badge-pendente');

    const ia = cfg.gemini || {};
    el.ia.textContent = ia.configurado
      ? 'IA Gemini ativa (' + (ia.modelo || '—') + ')'
      : 'Sem GEMINI_API_KEY — classificação por palavras-chave';
    el.ia.className = 'badge ' + (ia.configurado ? 'badge-confirmado' : 'badge-neutro');

    el.gmail.innerHTML = cfg.mode === 'real'
      ? 'Caixa monitorada: <strong>' + esc(cfg.gmailUser) + '</strong>' +
        (cfg.ultimaVerificacao ? ' · última verificação: ' + esc(fmtDataHoraBR(cfg.ultimaVerificacao.slice(0, 16))) : '') +
        ' · encaminhar para: <strong>' + esc(cfg.forwardTo) + '</strong>'
      : 'Sem GMAIL_USER/GMAIL_PASS no .env — o bot roda em modo demonstração (nada é enviado). Coloque as credenciais para ativar o modo real.';

    el.statTotal.textContent = String(cfg.totalProcessadas);
    el.statResp.textContent = String(cfg.totalRespondidas);
    el.statEnc.textContent = String(cfg.totalEncaminhadas);

    if (!document.activeElement || document.activeElement.id !== 'cfg-forward') el.cfgForward.value = cfg.forwardTo;
    if (!document.activeElement || document.activeElement.id !== 'cfg-nome') el.cfgNome.value = cfg.assistantName;
    if (!document.activeElement || document.activeElement.id !== 'cfg-segundos') el.cfgSegundos.value = cfg.seconds;
  }

  function renderHistorico() {
    let hist = [];
    try { hist = API.botHistorico(50); } catch (e) { showToast(msgErro(e), 'error'); return; }

    if (!hist.length) {
      el.tb.innerHTML = '<tr><td colspan="5"><div class="empty-state"><h3>Nenhuma mensagem ainda</h3><p>Use o simulador acima ou ative o bot para começar a acompanhar o Gmail.</p></div></td></tr>';
      return;
    }

    el.tb.innerHTML = hist.map(h =>
      '<tr>' +
        '<td class="mono" style="white-space:nowrap;">' + esc(fmtDataHoraBR(String(h.ts).slice(0, 16))) + '</td>' +
        '<td style="white-space:nowrap;">' + esc(h.nome || h.de || '—') + '<br><span style="font-size:12px;color:var(--text-muted);">' + esc(h.de) + '</span></td>' +
        '<td style="max-width:220px;">' + esc(h.assunto) + '</td>' +
        '<td>' + decisaoBadge(h.decisao) + (h.simulado ? '<br><span style="font-size:11px;color:var(--text-muted);">simulado</span>' : '') + '</td>' +
        '<td style="max-width:320px;font-size:13px;color:var(--text-muted);">' +
          esc(h.motivo || '') +
          (h.motor ? '<br><span style="font-size:11px;color:var(--text-muted);">motor: <strong>' + esc(h.motor) + '</strong></span>' : '') +
          (h.destino ? '<br><span style="color:var(--text);">' + esc(h.destino) + '</span>' : '') +
          (h.erro ? '<br><span class="badge badge-cancelado">' + esc(h.erro) + '</span>' : '') +
        '</td>' +
      '</tr>'
    ).join('');
  }

  function recarregarTudo() {
    carregarEstado();
    renderHistorico();
  }

  /* ---------------- ativação ---------------- */

  el.sw.addEventListener('change', () => {
    try {
      const r = API.botAtivar(el.sw.checked);
      showToast(r.enabled ? 'Bot ativado. Ele já começa a monitorar a caixa.' : 'Bot desativado.');
      recarregarTudo();
    } catch (e) {
      el.sw.checked = !el.sw.checked;
      showToast(msgErro(e), 'error');
    }
  });

  /* ---------------- configuração ---------------- */

  document.getElementById('form-config').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      API.botConfigurar({
        forwardTo: el.cfgForward.value.trim(),
        assistantName: el.cfgNome.value.trim(),
        seconds: parseInt(el.cfgSegundos.value, 10)
      });
      showToast('Configuração salva.');
      recarregarTudo();
    } catch (err2) { showToast(msgErro(err2), 'error'); }
  });

  /* ---------------- simulador ---------------- */

  const quick = {
    preco: ['Quanto custa um corte?', 'Oi! Quanto custa um corte de cabelo no salão de vocês?'],
    horario: ['Horário de funcionamento', 'Que horas vocês abrem? Funciona aos domingos?'],
    agendar: ['Quero agendar', 'Quero marcar um corte para amanhã às 15h, tem vaga?']
  };

  document.querySelectorAll('[data-quick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = quick[btn.dataset.quick];
      if (!q) return;
      document.getElementById('test-subject').value = q[0];
      document.getElementById('test-text').value = q[1];
    });
  });

  function iframePreview(html) {
    const frame = document.createElement('iframe');
    frame.srcdoc = html || '';
    frame.style.cssText = 'width:100%;height:400px;border:1px solid var(--line);border-radius:8px;background:#ffffff;margin-top:6px;';
    frame.setAttribute('loading', 'lazy');
    return frame;
  }

  document.getElementById('form-teste').addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = {
      from: document.getElementById('test-from').value.trim(),
      subject: document.getElementById('test-subject').value.trim(),
      text: document.getElementById('test-text').value.trim()
    };

    let r = null;
    try { r = API.botTestar(dados); } catch (err2) {
      showToast(msgErro(err2), 'error');
      return;
    }

    const div = el.resultado;
    div.hidden = false;
    div.innerHTML = '';

    const cab =
      '<div class="card" style="border-color:var(--line);padding:16px 18px;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          decisaoBadge(r.decisao) +
          (r.simulado ? '<span class="badge badge-pendente">Simulação (nada foi enviado)</span>' : '<span class="badge badge-confirmado">Envio real</span>') +
        '</div>' +
        '<p style="margin:10px 0 0;color:var(--text-muted);font-size:14px;">' + esc(r.motivo || '') + ' ' +
          (r.categorias && r.categorias.length ? '— categorias: <strong>' + esc(r.categorias.join(', ')) + '</strong>' : '') +
          (r.motor ? ' — motor: <strong>' + esc(r.motor) + '</strong>' : '') +
        '</p>' +
        (r.destino ? '<p style="margin:6px 0 0;font-size:13px;">' + esc(r.destino) + '</p>' : '') +
        (r.erro ? '<p class="badge badge-cancelado" style="margin-top:8px;">' + esc(r.erro) + '</p>' : '') +
      '</div>';

    const titulo = document.createElement('div');
    titulo.className = 'section-title';
    titulo.textContent = r.decisao === 'responder' ? 'E-mail que o bot enviaria' : 'Aviso enviado ao cliente';

    div.insertAdjacentHTML('beforeend', cab);
    div.appendChild(titulo);
    div.appendChild(iframePreview(r.decisao === 'responder' ? r.respostaHtml : r.avisoHtml));

    if (r.decisao === 'encaminhar') {
      const enc = document.createElement('p');
      enc.style.cssText = 'color:var(--text-muted);font-size:13px;margin:10px 0 0;';
      enc.textContent = 'Além disso, a mensagem original foi encaminhada para o atendente da empresa, que responde em seguida.';
      div.appendChild(enc);
    }
  });

  /* ---------------- ações ---------------- */

  document.getElementById('btn-verificar').addEventListener('click', () => {
    try {
      const r = API.botVerificarAgora();
      showToast((r && r.mensagem) || 'Verificação concluída.');
      recarregarTudo();
    } catch (e) { showToast(msgErro(e), 'error'); }
  });

  document.getElementById('btn-limpar').addEventListener('click', () => {
    if (!confirm('Apagar todo o histórico do bot?')) return;
    try { API.botLimparHistorico(); showToast('Histórico apagado.'); renderHistorico(); }
    catch (e) { showToast(msgErro(e), 'error'); }
  });

  document.getElementById('btn-refresh').addEventListener('click', renderHistorico);

  recarregarTudo();
});