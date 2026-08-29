/* ============================================================
   Corte Certo – public/js/salao-publico.js
   Página pública do salão: funcionamento real (RF-028..031),
   galeria, avaliações e agendamento com slots reais da engine
   + escolha automática de profissional (DT-03/DT-04).
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const lojaId = params.get('id') || '';

  let loja;
  try { loja = API.getLoja(lojaId); }
  catch (e) { window.location.href = 'catalogo.html'; return; }

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* ---------- cabeçalho ---------- */
  document.title = loja.name + ' · Corte Certo';

  document.getElementById('salao-nome').textContent = loja.name;
  const meta = document.getElementById('salao-meta');
  if (meta) {
    meta.innerHTML =
      '<span class="rating">★ ' + Number(loja.rating_avg || 0).toFixed(1) + '</span>' +
      (loja.rating_count ? ' (' + loja.rating_count + ' avaliações)' : '') +
      ' · ' + esc([loja.address, loja.city && loja.city + (loja.uf ? '/' + loja.uf : '')].filter(Boolean).join(' – ') || 'Endereço não informado') +
      (loja.phone ? ' · <span class="mono">' + esc(loja.phone) + '</span>' : '');
  }
  const tagList = document.getElementById('salao-tags');
  if (tagList) tagList.innerHTML = (loja.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('');

  /* ---------- funcionamento a partir de working_hours (RF-028) ---------- */
  const funcEl = document.getElementById('salao-funcionamento');
  if (funcEl) {
    let linhas = [];
    try { linhas = API.horariosDaLoja(loja.id, true); } catch (e) { /* noop */ }
    const abertos = linhas.filter(l => l.is_open);
    funcEl.innerHTML = abertos.length
      ? agruparHorarios(abertos)
      : '<em>Horários sob consulta</em>';
  }

  function agruparHorarios(abertos) {
    return abertos
      .slice()
      .sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7))
      .map(l => '<div>' + DIAS[l.day_of_week] + ' <span class="mono">' +
        esc(l.start_time) + '–' + esc(l.end_time) +
        (l.lunch_start ? ' (almoço ' + esc(l.lunch_start) + '–' + esc(l.lunch_end) + ')' : '') +
        '</span></div>')
      .join('');
  }

  /* ---------- galeria ---------- */
  let fotos = [];
  try { fotos = API.galeriaDaLoja(loja.id); } catch (e) { /* noop */ }
  const track = document.getElementById('gallery-track');
  if (track) {
    /* sem fotos na galeria, mostra a capa/logo escolhida pelo salão;
       sem nenhuma imagem, aí sim usa o placeholder */
    const capaLoja = loja.logo_url || loja.cover_url; // perfil primeiro
    const slides = fotos.length
      ? fotos
      : (capaLoja ? [{ url: capaLoja }] : [{ url: null }]);
    track.innerHTML = slides.map(f => {
      /* &quot; e obrigatorio: aspas cruas aqui fechariam o atributo style
         no meio da URL e a foto ficaria preta */
      const estilo = f.url
        ? 'background:#000 url(&quot;' + f.url + '&quot;) center/cover no-repeat;'
        : 'background:linear-gradient(135deg,#2c2f36,#4a3f35);';
      return '<div class="gallery-slide"><div class="gallery-photo" style="' + estilo + '"><span>' +
        esc(f.url ? '' : loja.name) + '</span></div></div>';
    }).join('');

    let slide = 0;
    const total = slides.length;
    const counter = document.getElementById('gallery-counter');

    function update() {
      track.style.transform = 'translateX(-' + (slide * 100) + '%)';
      if (counter) counter.textContent = total ? (slide + 1) + ' / ' + total : '0 / 0';
    }
    document.getElementById('gallery-prev')?.addEventListener('click', () => {
      slide = slide > 0 ? slide - 1 : total - 1; update();
    });
    document.getElementById('gallery-next')?.addEventListener('click', () => {
      slide = slide < total - 1 ? slide + 1 : 0; update();
    });
    const viewport = document.getElementById('gallery-viewport');
    let tx = 0;
    viewport?.addEventListener('touchstart', e => { tx = e.changedTouches[0].screenX; }, { passive: true });
    viewport?.addEventListener('touchend', e => {
      const diff = tx - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        slide = diff > 0 ? (slide < total - 1 ? slide + 1 : 0) : (slide > 0 ? slide - 1 : total - 1);
        update();
      }
    }, { passive: true });
    update();
  }

  /* ---------- profissionais ---------- */
  let profissionais = [];
  try { profissionais = API.profissionaisDaLoja(loja.id, true); } catch (e) { /* noop */ }
  let horasProf = [];
  try { horasProf = API.horariosDaLoja(loja.id); } catch (e) { /* noop */ }

  const listaProfs = document.getElementById('lista-profissionais-publica');
  if (listaProfs) {
    listaProfs.innerHTML = profissionais.map(p => {
      const dias = horasProf.filter(w => w.professional_id === p.id && w.is_open)
        .map(w => w.day_of_week).sort((a, b) => a - b);
      const linha = horasProf.find(w => w.professional_id === p.id);
      const diasTxt = dias.length
        ? DIAS[dias[0]] + (dias.length > 1 ? '–' + DIAS[dias[dias.length - 1]] : '')
        : '';
      const horarioTxt = linha
        ? diasTxt + ' · ' + linha.start_time + '–' + linha.end_time
        : '';
      return '<div class="prof-card-public">' +
        '<div class="prof-avatar"' +
          (p.color ? ' style="background:' + esc(p.color) + '22;color:' + esc(p.color) + ';border-color:' + esc(p.color) + '66;"' : '') + '>' +
          esc(DB.iniciais(p.name)) + '</div>' +
        '<div>' +
          '<div class="prof-name">' + esc(p.name) + '</div>' +
          (p.bio ? '<div class="prof-role">' + esc(p.bio) + '</div>' : '') +
          (horarioTxt ? '<div class="prof-hours">' + esc(horarioTxt) + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('') ||
    '<div class="empty-state" style="grid-column:1/-1;"><h3>Agendamento direto com o salão</h3><p>Este salão ainda não cadastrou profissionais — você ainda pode agendar pelos horários do estabelecimento.</p></div>';
  }

  /* ---------- serviços ---------- */
  let servicos = [];
  try { servicos = API.servicosDaLoja(loja.id, true); } catch (e) { /* noop */ }

  const listaSvc = document.getElementById('lista-servicos-publica');
  if (listaSvc) {
    listaSvc.innerHTML = servicos.map(s =>
      '<div class="service-row-public" data-servico-id="' + s.id + '">' +
        '<div>' +
          '<div class="svc-name">' + esc(s.name) +
            (s.category ? ' <small style="color:var(--text-muted)">· ' + esc(s.category) + '</small>' : '') + '</div>' +
          '<div class="svc-duration">' + fmtDuracao(s.duration_min) +
            (s.description ? ' · ' + esc(s.description) : '') + '</div>' +
        '</div>' +
        '<div class="svc-right">' +
          '<span class="svc-price mono">' + DB.fmtBRL(s.price) + '</span>' +
          '<button class="btn btn-brass btn-agendar">Agendar</button>' +
        '</div>' +
      '</div>'
    ).join('') ||
    '<div class="empty-state"><h3>Nenhum serviço cadastrado</h3><p>Este salão ainda não cadastrou serviços.</p></div>';
  }

  /* ---------- avaliações (RF-055) ---------- */
  function renderReviews() {
    const box = document.getElementById('lista-reviews');
    const resumo = document.getElementById('reviews-resumo');
    if (!box) return;
    let reviews = [];
    try { reviews = API.reviewsDaLoja(loja.id); } catch (e) { /* noop */ }

    if (resumo) {
      resumo.innerHTML = reviews.length
        ? '<span class="rating">★ ' + Number(loja.rating_avg || 0).toFixed(1) + '</span> · ' +
          reviews.length + ' avaliação(ões)'
        : '<span style="color:var(--text-muted)">Ainda sem avaliações — seja o primeiro!</span>';
    }

    box.innerHTML = reviews.slice(0, 8).map(r => {
      const estrelas = '★'.repeat(Math.max(1, Math.min(5, Number(r.rating) || 0))) +
        '☆'.repeat(5 - Math.max(1, Math.min(5, Number(r.rating) || 0)));
      return '<div class="review-item">' +
        '<div class="review-top"><strong>' + esc(r.client_name) + '</strong>' +
          '<span class="rating">' + estrelas + '</span>' +
          '<small style="color:var(--text-muted)">' + DB.fmtDataBR(String(r.created_at).slice(0, 10)) + '</small></div>' +
        (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') +
      '</div>';
    }).join('') ||
    '<p style="color:var(--text-muted)">Nenhuma avaliação por aqui.</p>';
  }

  /* ==========================================================
     FLUXO DE AGENDAMENTO (UC-14, DT-03/DT-04)
     ========================================================== */
  const modal = document.getElementById('modal-agendar-cliente');
  const form = document.getElementById('form-agendar-cliente');
  const slotDates = document.getElementById('slot-dates');
  const slotTimes = document.getElementById('slot-times');
  const fieldDatas = document.getElementById('field-datas');
  const fieldHorarios = document.getElementById('field-horarios');
  const fieldDados = document.getElementById('field-dados');
  const fieldTelefone = document.getElementById('field-telefone');
  const profInfo = document.getElementById('prof-info');
  const resumoServico = document.getElementById('ag-resumo');
  const btnConfirmar = document.getElementById('btn-confirmar-agendamento');
  const acNome = document.getElementById('ac-nome');
  const acTelefone = document.getElementById('ac-telefone');

  const logado = Auth.usuarioAtual();
  const ehClienteLogado = logado && logado.role === 'cliente';

  let svcSelecionado = null;
  let dataEscolhida = null;
  let horaEscolhida = null;
  let profResolvido = null;

  /* Tarefa 3: agendar exige conta. Sem sessão → login com retorno
     para esta mesma página do salão (?next= é honrado pós-login). */
  function exigirSessao() {
    if (Auth.usuarioAtual()) return true;
    sessionStorage.setItem('cc_flash', JSON.stringify({
      texto: 'Faça login para agendar seu horário.',
      tipo: 'error'
    }));
    const volta = 'salao-publico.html?id=' + encodeURIComponent(loja.id);
    window.location.href = '../admin/login.html?next=' + encodeURIComponent(volta);
    return false;
  }

  if (ehClienteLogado) {
    if (acNome) acNome.value = logado.name || '';
    if (acTelefone) acTelefone.value = logado.phone || '';
  }

  function fmtISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* datas dos próximos 14 dias em que o salão abre */
  function renderDatas() {
    slotDates.innerHTML = '';
    let encontrados = 0;
    for (let i = 0; i < 14 && encontrados < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = fmtISO(d);

      let disp;
      try { disp = API.disponibilidade(loja.id, iso, duracaoAtual()); }
      catch (e) { break; }
      if (!disp.is_open) continue;

      encontrados++;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slot-date';
      chip.dataset.data = iso;
      chip.innerHTML =
        '<span class="slot-day">' + DIAS[d.getDay()] + '</span>' +
        '<span class="slot-date-num">' + d.getDate() + '</span>' +
        '<span class="slot-month">' + MESES[d.getMonth()] + '</span>';
      chip.addEventListener('click', () => {
        slotDates.querySelectorAll('.slot-date').forEach(s => s.classList.remove('active'));
        chip.classList.add('active');
        dataEscolhida = iso;
        horaEscolhida = null;
        profResolvido = null;
        btnConfirmar.disabled = true;
        fieldDados.style.display = 'none';
        fieldTelefone.style.display = 'none';
        if (profInfo) profInfo.textContent = '';
        renderHorarios();
      });
      slotDates.appendChild(chip);
    }

    if (!encontrados) {
      slotDates.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Salão sem datas abertas nos próximos dias.</p>';
    }
    fieldDatas.style.display = '';
  }

  function duracaoAtual() {
    return svcSelecionado ? svcSelecionado.duration_min : 30;
  }

  function renderHorarios() {
    slotTimes.innerHTML = '';
    fieldHorarios.style.display = '';
    if (!dataEscolhida) return;

    let disp;
    try { disp = API.disponibilidade(loja.id, dataEscolhida, duracaoAtual()); }
    catch (e) {
      slotTimes.innerHTML = '<p style="color:var(--stripe-red);font-size:13px;">' + esc(msgErro(e)) + '</p>';
      return;
    }

    if (!disp.available_slots.length) {
      slotTimes.innerHTML = '<p style="color:var(--text-muted);font-size:13px;margin:4px 0;">Nenhum horário livre neste dia.</p>';
      return;
    }

    disp.available_slots.forEach(hora => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-time';
      btn.textContent = hora;
      btn.addEventListener('click', () => {
        slotTimes.querySelectorAll('.slot-time').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        horaEscolhida = hora;

        /* DT-04: quem pode atender este slot na união? */
        profResolvido = null;
        if (profInfo) profInfo.textContent = 'Carregando profissional…';
        try {
          profResolvido = API.profissionalParaSlot(loja.id, dataEscolhida, hora, duracaoAtual());
        } catch (e) { profResolvido = null; }
        if (profInfo) {
          profInfo.textContent = profResolvido
            ? 'Atendimento com ' + profResolvido.professional_name + '.'
            : 'Atendimento pelo horário geral do salão.';
        }

        btnConfirmar.disabled = false;
        fieldDados.style.display = '';
        fieldTelefone.style.display = ehClienteLogado && logado.phone ? 'none' : '';
      });
      slotTimes.appendChild(btn);
    });
  }

  document.querySelectorAll('.btn-agendar').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!exigirSessao()) return; /* anônimo vai para o login */

      const row = btn.closest('.service-row-public');
      svcSelecionado = servicos.find(s => String(s.id) === row?.dataset.servicoId) || null;

      dataEscolhida = null;
      horaEscolhida = null;
      profResolvido = null;
      btnConfirmar.disabled = true;
      fieldHorarios.style.display = 'none';
      fieldDados.style.display = 'none';
      fieldTelefone.style.display = 'none';
      if (profInfo) profInfo.textContent = '';

      if (resumoServico && svcSelecionado) {
        resumoServico.hidden = false;
        resumoServico.innerHTML =
          '<strong>' + esc(svcSelecionado.name) + '</strong> · ' +
          fmtDuracao(svcSelecionado.duration_min) + ' · <span class="mono">' +
          DB.fmtBRL(svcSelecionado.price) + '</span>';
      }

      renderDatas();
      abrirModal(modal);
    });
  });

  document.getElementById('btn-fechar-modal-agendar')
    ?.addEventListener('click', () => fecharModal(modal));
  modal?.addEventListener('click', e => { if (e.target === modal) fecharModal(modal); });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!exigirSessao()) return; /* sessão pode ter caído no meio do fluxo */
    if (!svcSelecionado || !dataEscolhida || !horaEscolhida) return;

    const nome = (acNome?.value || '').trim();
    const tel = (acTelefone?.value || '').replace(/\D/g, '');
    if (!nome) { showToast('Informe seu nome.', 'error'); return; }
    if (tel.length < 10) { showToast('Informe um telefone válido com DDD.', 'error'); return; }

    const payload = {
      barbershop_id: loja.id,
      date: dataEscolhida,
      start_time: horaEscolhida,
      service_ids: [svcSelecionado.id],
      client_name: nome,
      client_phone: tel,
      origin: 'online'
    };
    if (profResolvido) payload.professional_id = profResolvido.professional_id;

    try {
      API.criarAgendamento(payload);
      showToast('Agendamento solicitado! Aguardando confirmação do salão.');
      fecharModal(modal);
      form.reset();
    } catch (err2) {
      showToast(msgErro(err2), 'error');
      if (err2 && err2.status === 409) {
        horaEscolhida = null;
        btnConfirmar.disabled = true;
        renderHorarios();
      }
    }
  });

  renderReviews();

  const btnCompartilhar = document.getElementById('btn-compartilhar');
  if (btnCompartilhar) {
    btnCompartilhar.addEventListener('click', () => {
      const url = window.location.href;
      const nomeEl = document.querySelector('.salon-name, h1, .salao-nome');
      const texto = 'Confira ' + (nomeEl ? nomeEl.textContent : 'esta barbearia') + ' no Corte Certo: ';
      if (navigator.share) {
        navigator.share({ title: 'Corte Certo', text: texto, url: url });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(texto + url).then(() => alert('Link copiado!'));
      } else {
        window.open('https://wa.me/?text=' + encodeURIComponent(texto + url), '_blank');
      }
    });
  }
});
