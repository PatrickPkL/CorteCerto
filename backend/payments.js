'use strict';
/* ============================================================
   Corte Certo – payments.js
   Cobrança mensal dos planos via AbacatePay (PIX).

   • Com ABACATEPAY_API_KEY no .env → PIX real pela API v2
     (chave de Dev mode = transações simuladas no sandbox deles)
   • Sem chave → modo simulado local: gera um "PIX fake" e
     libera confirmarCobrancaDemo() para testar o fluxo inteiro

   Confirmação do pagamento:
   1. Polling — statusCobranca() consulta a AbacatePay (ou o
      estado local, no modo demo) chamado pela tela Assinatura;
   2. Webhook — server.js recebe POST /webhooks/abacatepay,
      valida o secret/assinatura e chama processarEventoWebhook().

   Ao confirmar: subscription.status='ativa', plan_id do plano
   pago e current_period_end estendido em +30 dias (a partir do
   fim do período vigente, preservando trial em andamento).
   ============================================================ */

(function () {
  const DB = window.DB;
  const Auth = window.Auth;

  const URL_API = 'https://api.abacatepay.com/v2';
  const EXPIRA_EM_SEG = 3600; // QR Code PIX válido por 1h

  function agoraISO() { return new Date().toISOString().slice(0, 16); }
  function agoraMsISO() { return new Date().toISOString(); }

  function chaveApi() {
    return String(process.env.ABACATEPAY_API_KEY || '').trim();
  }

  /* ---------- auth local (exigirDono vive fechado no api.js) ---------- */

  function exigirDonoLocal() {
    const user = Auth.usuarioAtual();
    if (!user) throw { status: 401, error: 'Faça login para continuar.' };
    if (user.role !== 'dono') throw { status: 403, error: 'Acesso restrito ao dono do salão.' };
    const shop = Auth.salaoDoUsuario(user);
    if (!shop) throw { status: 403, error: 'Nenhum salão vinculado a esta conta.' };
    return { user, shop };
  }

  /* ---------- helpers de cobrança ---------- */

  function pagamentoPublico(pag) {
    const plano = DB._d().plans.find(p => p.id === pag.plan_id);
    return {
      id: pag.id,
      plan_name: plano ? plano.name : '—',
      amount_cents: pag.amount_cents,
      status: pag.status,
      provider: pag.provider,
      br_code: pag.br_code || '',
      qr_base64: pag.qr_base64 || '',
      abacate_id: pag.abacate_id || null,
      dev_mode: pag.dev_mode === true,
      created_at: pag.created_at,
      expires_at: pag.expires_at,
      paid_at: pag.paid_at || null
    };
  }

  /**
   * Ativação idempotente do plano pago. Renovações antecipadas
   * empilham a partir do fim do período atual (trial preservado).
   */
  function aplicarPagamento(pag) {
    if (!pag || pag.status === 'paid') return false;
    const db = DB._d();
    pag.status = 'paid';
    pag.paid_at = agoraISO();

    let sub = db.subscriptions.find(s => s.barbershop_id === pag.barbershop_id);
    const hoje = DB.hojeISO();
    if (!sub) {
      sub = {
        id: DB.proximoId(), barbershop_id: pag.barbershop_id,
        plan_id: pag.plan_id, status: 'ativa', trial_ends_at: null,
        current_period_end: DB.addDiasISO(30),
        created_at: agoraISO(), updated_at: agoraISO()
      };
      db.subscriptions.push(sub);
    } else {
      const base = (sub.current_period_end && sub.current_period_end > hoje)
        ? sub.current_period_end : hoje;
      sub.plan_id = pag.plan_id;
      sub.status = 'ativa';
      sub.current_period_end = DB.addDiasISO(30, base);
      sub.updated_at = agoraISO();
    }
    DB.salvar();
    return true;
  }

  async function criarCobrancaAbacate(pag, plano) {
    /* customer é opcional no PIX e EXIGE taxId quando informado —
       como não coletamos CPF do dono, enviamos só o essencial */
    const resp = await fetch(URL_API + '/transparents/create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + chaveApi(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'PIX',
        data: {
          amount: pag.amount_cents,
          expiresIn: EXPIRA_EM_SEG,
          description: 'Corte Certo — Plano ' + plano.name + ' (30 dias)',
          externalId: 'cc_pay_' + pag.id,
          metadata: { payment_db_id: String(pag.id), barbershop_id: String(pag.barbershop_id), plan_id: String(pag.plan_id) }
        }
      })
    });
    let corpo = null;
    try { corpo = await resp.json(); } catch (e) { /* resposta não-JSON */ }
    if (!resp.ok || !corpo || corpo.success !== true || !corpo.data) {
      const motivo = (corpo && (corpo.error && (corpo.error.message || corpo.error))) ||
        ('HTTP ' + resp.status);
      console.error('[payments] AbacatePay recusou a cobrança:', motivo);
      throw { status: 502, error: 'Falha ao gerar o PIX na AbacatePay (' + motivo + '). Tente novamente.' };
    }
    return corpo.data;
  }

  /* ================= API pública ================= */

  /**
   * Gera o PIX para assinar/renovar um plano. Reaproveita uma
   * cobrança pendente ainda válida da mesma loja+plano.
   */
  async function criarCobrancaPlano(planId) {
    const { shop } = exigirDonoLocal();
    const db = DB._d();

    const plano = db.plans.find(p => p.id == planId);
    if (!plano) err400('Plano não encontrado.');

    /* pendente reutilizável? */
    const agora = agoraMsISO();
    const existente = db.payments.find(p =>
      p.barbershop_id === shop.id && p.plan_id === plano.id &&
      p.status === 'pending' && p.expires_at > agora);
    if (existente) return pagamentoPublico(existente);

    const pag = {
      id: DB.proximoId(),
      barbershop_id: shop.id,
      plan_id: plano.id,
      amount_cents: Math.round(Number(plano.price_monthly || 0) * 100),
      status: 'pending',
      provider: chaveApi() ? 'abacatepay' : 'demo',
      abacate_id: null,
      br_code: '',
      qr_base64: '',
      created_at: agoraISO(),
      expires_at: new Date(Date.now() + EXPIRA_EM_SEG * 1000).toISOString()
    };

    if (pag.provider === 'abacatepay') {
      const d = await criarCobrancaAbacate(pag, plano);
      pag.abacate_id = d.id;
      pag.br_code = d.brCode || '';
      pag.qr_base64 = d.brCodeBase64 || '';
      pag.expires_at = d.expiresAt || pag.expires_at;
      pag.dev_mode = d.devMode === true; /* sandbox → permite simular pagamento */
    } else {
      /* modo simulado — código PIX inválido apenas ilustrativo */
      pag.br_code = '00020126BR.GOV.BCB.PIX01CORTECERTO-DEMO520400005303986' +
        '5802BR5904DEMO6009SAO PAULO62070503***' + String(pag.id).padStart(3, '0') + '6304DEMO';
    }

    db.payments.push(pag);
    DB.salvar();
    return pagamentoPublico(pag);
  }

  /** Consulta a situação de uma cobrança (polling da tela). */
  async function statusCobranca(paymentId) {
    const { shop } = exigirDonoLocal();
    const pag = DB._d().payments.find(p => p.id == paymentId && p.barbershop_id === shop.id);
    if (!pag) throw { status: 404, error: 'Cobrança não encontrada.' };
    if (pag.status !== 'pending') return pagamentoPublico(pag);

    /* expirou sem pagar */
    if (pag.expires_at <= agoraMsISO()) {
      pag.status = 'expired';
      DB.salvar();
      return pagamentoPublico(pag);
    }

    if (pag.provider === 'abacatepay' && pag.abacate_id) {
      const situacao = await consultarAbacate(pag.abacate_id);
      if (situacao === 'PAID') aplicarPagamento(pag);
      else if (situacao === 'EXPIRED' || situacao === 'CANCELLED') {
        pag.status = situacao === 'EXPIRED' ? 'expired' : 'cancelled';
        DB.salvar();
      }
    }
    return pagamentoPublico(pag);
  }

  /** GET do status na AbacatePay (endpoint oficial de consulta). */
  async function consultarAbacate(chargeId) {
    try {
      const resp = await fetch(
        URL_API + '/transparents/check?id=' + encodeURIComponent(chargeId),
        { headers: { 'Authorization': 'Bearer ' + chaveApi() } });
      if (!resp.ok) return null;
      const corpo = await resp.json();
      return (corpo && corpo.data && corpo.data.status) || null;
    } catch (e) { return null; }
  }

  /**
   * Modo simulado: confirma uma cobrança demo pendente.
   * Nunca afeta cobranças reais (provider 'abacatepay').
   */
  function confirmarCobrancaDemo(paymentId) {
    const { shop } = exigirDonoLocal();
    const pag = DB._d().payments.find(p => p.id == paymentId && p.barbershop_id === shop.id);
    if (!pag) throw { status: 404, error: 'Cobrança não encontrada.' };
    if (pag.provider !== 'demo') throw { status: 409, error: 'Esta cobrança é real — use o app do banco.' };
    if (pag.status !== 'pending') throw { status: 409, error: 'Cobrança já processada.' };
    aplicarPagamento(pag);
    return pagamentoPublico(pag);
  }

  /** Dispara a simulação de pagamento na AbacatePay (só dev mode).
      Exige Content-Type json com corpo vazio — sem isso a API
      responde 400 "Pix QR Code not found". Requer CHECKOUT:READ. */
  async function simularNaAbacate(chargeId) {
    try {
      const resp = await fetch(
        URL_API + '/transparents/simulate-payment?id=' + encodeURIComponent(chargeId),
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + chaveApi(),
            'Content-Type': 'application/json'
          },
          body: ''
        });
      if (!resp.ok) return null;
      const corpo = await resp.json();
      return corpo && corpo.data ? corpo.data : null;
    } catch (e) { return null; }
  }

  /**
   * Confirma uma cobrança pendente para testes:
   * • provider demo → ativa localmente;
   * • provider abacatepay → pede à própria AbacatePay para simular
   *   o pagamento (endpoint oficial de Dev mode; com chave de
   *   produção a API recusa e devolvemos o erro).
   */
  async function simularPagamento(paymentId) {
    const { shop } = exigirDonoLocal();
    const pag = DB._d().payments.find(p => p.id == paymentId && p.barbershop_id === shop.id);
    if (!pag) throw { status: 404, error: 'Cobrança não encontrada.' };
    if (pag.provider === 'demo') return confirmarCobrancaDemo(paymentId);
    if (!chaveApi()) throw { status: 409, error: 'Sem chave da AbacatePay configurada.' };
    if (pag.provider !== 'abacatepay' || !pag.abacate_id) {
      throw { status: 409, error: 'Cobrança inválida para simulação.' };
    }
    if (pag.status !== 'pending') throw { status: 409, error: 'Cobrança já processada.' };

    const resultado = await simularNaAbacate(pag.abacate_id);
    let situacao = (resultado && resultado.status) || null;
    if (situacao !== 'PAID') situacao = await consultarAbacate(pag.abacate_id);
    if (situacao === 'PAID') {
      aplicarPagamento(pag);
    } else {
      throw {
        status: 502,
        error: 'A AbacatePay recusou a simulação — confirme que a chave é de Dev mode.'
      };
    }
    return pagamentoPublico(pag);
  }

  /** Histórico real de cobranças da loja (mais recentes primeiro). */
  function listarMinhasCobrancas() {
    const { shop } = exigirDonoLocal();
    return DB._d().payments
      .filter(p => p.barbershop_id === shop.id)
      .sort((a, b) => b.id - a.id)
      .map(pagamentoPublico);
  }

  /**
   * Webhook da AbacatePay (server.js valida secret/HMAC antes).
   * Idempotente: eventos repetidos não duplicam ativação.
   */
  function processarEventoWebhook(ev) {
    const tipo = String((ev && ev.event) || '');
    const dados = (ev && ev.data) || {};
    const PAGOS = ['transparent.completed', 'checkout.completed',
      'pix.paid', 'billing.paid', 'subscription.renewed'];
    if (!PAGOS.includes(tipo)) return { ignored: true, event: tipo };

    let pag = null;
    const db = DB._d();
    if (dados.metadata && dados.metadata.payment_db_id != null) {
      pag = db.payments.find(p => p.id == Number(dados.metadata.payment_db_id));
    }
    if (!pag && dados.id) {
      pag = db.payments.find(p => p.abacate_id === dados.id);
    }
    if (!pag) return { ignored: true, motivo: 'cobranca_desconhecida' };
    const mudou = aplicarPagamento(pag);
    return { ok: true, payment_db_id: pag.id, applied: mudou };
  }

  function err400(msg) { throw { status: 404, error: msg }; }

  /**
   * A loja pode criar conteúdo? Liberada com trial vigente ou
   * período pago corrente (inclusive cancelada dentro do prazo —
   * acesso encerra ao fim do período, como promete a UI).
   */
  function acessoLiberado(shopId) {
    const db = DB._d();
    const hoje = DB.hojeISO();
    const sub = db.subscriptions.find(s => s.barbershop_id == shopId);
    if (!sub) return false;
    if (sub.status === 'trial') return !!sub.trial_ends_at && sub.trial_ends_at >= hoje;
    return !!sub.current_period_end && sub.current_period_end >= hoje;
  }

  Object.assign(window.API, {
    criarCobrancaPlano,
    statusCobranca,
    listarMinhasCobrancas,
    confirmarCobrancaDemo,
    simularCobranca: simularPagamento,
    processarEventoWebhook,
    acessoLiberado
  });
})();
