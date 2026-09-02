'use strict';
/* ============================================================
   Corte Certo – payments.js
   Cobrança dos planos via AbacatePay.

   Métodos de pagamento:
   • PIX (padrão) — QR Code + código copia-e-cola via transpare
     AbacatePay (real na versão v2). Sem chave → PIX fake (demo).
   • Cartão (débito/crédito) com parcelamento 1..12 — o checkout
     transparente da AbacatePay NÃO aceita cartão (só PIX/Boleto);
     o cartão é, portanto, processado em modo local/simulado até
     haver integração com o checkout hospedado deles.

   • Com ABACATEPAY_API_KEY no .env → PIX real (Dev mode = sandbox)
   • Sem chave → modo simulado local: gera um "PIX fake" e libera
     confirmarCobrancaDemo() para testar o fluxo inteiro.

   Confirmação do pagamento:
   1. Polling — statusCobranca() consulta a AbacatePay (ou o
      estado local, no modo demo) chamado pela tela Assinatura;
   2. Webhook — server.js recebe POST /webhooks/abacatepay,
      valida o secret/assinatura e chama processarEventoWebhook().

Ao confirmar: subscription.status='ativa', plan_id do plano
    pago e current_period_end estendido em +30 dias (mensal) ou
    +365 dias (anual), a partir do fim do período vigente,
    preservando trial em andamento. O total anual é SEMPRE
    12× o valor mensal (sem desconto).
    ============================================================ */

(function () {
  const DB = window.DB;
  const Auth = window.Auth;

  const URL_API = 'https://api.abacatepay.com/v2';
  const EXPIRA_EM_SEG = 3600; // QR Code PIX válido por 1h

  /* ---------- cartão: regras de cartão brasileiro (RF-064) ---------- */

  function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }

  function marcaDoCartao(num) {
    const n = soDigitos(num);
    if (/^4/.test(n)) return 'Visa';
    if (/^5[1-5]/.test(n) || /^(2|6)[2-7]/.test(n)) return 'Mastercard';
    if (/^3[47]/.test(n)) return 'Amex';
    if (/^3(0|6|8)/.test(n)) return 'Diners';
    if (/^(4[0-9]{12}|(4011|4312|4389)[0-9])/.test(n)) return 'Elo';
    if (/^6/.test(n)) return 'Hipercard';
    return '—';
  }

  function validarCartao(d) {
    const num = soDigitos(d && d.numero);
    if (num.length < 13 || num.length > 19) throw { status: 400, error: 'Número do cartão inválido.' };
    const nome = String((d && d.titular) || '').trim();
    if (nome.length < 3) throw { status: 400, error: 'Informe o nome impresso no cartão.' };
    const val = String((d && d.validade) || '').replace(/\s/g, '');
    const mM = /^(\d{2})[/]?(\d{2})$/.exec(val);
    if (!mM) throw { status: 400, error: 'Validade inválida (use MM/AA).' };
    const mes = Number(mM[1]); const ano = 2000 + Number(mM[2]);
    if (mes < 1 || mes > 12) throw { status: 400, error: 'Mês da validade inválido.' };
    const agora = new Date();
    const fimMes = new Date(ano, mes, 0, 23, 59, 59);
    if (fimMes < agora) throw { status: 400, error: 'Cartão vencido.' };
    const cvv = soDigitos(d && d.cvv);
    if (cvv.length < 3 || cvv.length > 5) throw { status: 400, error: 'CVV inválido.' };
    return { numero: num, nome, mes, ano, cvv };
  }

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
      billing_period: pag.billing_period || 30,
      installments: pag.installments || 1,
      amount_cents: pag.amount_cents,
      metodo: pag.metodo || 'pix',
      card_brand: pag.card_brand || null,
      card_last4: pag.card_last4 || null,
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
    const dias = Number(pag.billing_period || 30);
    if (!sub) {
      sub = {
        id: DB.proximoId(), barbershop_id: pag.barbershop_id,
        plan_id: pag.plan_id, status: 'ativa', trial_ends_at: null,
        billing_period: dias,
        current_period_end: DB.addDiasISO(dias),
        trial_usado: true, created_at: agoraISO(), updated_at: agoraISO()
      };
      db.subscriptions.push(sub);
    } else {
      const base = (sub.current_period_end && sub.current_period_end > hoje)
        ? sub.current_period_end : hoje;
      sub.plan_id = pag.plan_id;
      sub.status = 'ativa';
      sub.billing_period = dias;
      sub.trial_usado = true;
      sub.current_period_end = DB.addDiasISO(dias, base);
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
          description: 'Corte Certo — Plano ' + plano.name + ' (' +
            ((pag.billing_period || 30) === 365 ? 'anual' : '30 dias') + ')',
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
   * cobrança pendente ainda válida da mesma loja+plano+período.
   *
   * periodo: 'mensal' (padrão, 30 dias) | 'anual' (365 dias,
   * cobrança de 12× o valor mensal). A opção de parcelar só é
   * aceita no período anual (parcelas de 1 a 12).
   */
  async function criarCobrancaPlano(planId, periodo, parcelas, metodo, cardData) {
    const { shop } = exigirDonoLocal();
    const db = DB._d();

    const plano = db.plans.find(p => p.id == planId);
    if (!plano) err400('Plano não encontrado.');
    if (plano.is_free) err400('O plano Free não pode ser assinado — é o plano base gratuito.');

    const mtd = String(metodo || 'pix').toLowerCase();
    if (mtd !== 'pix' && mtd !== 'cartao') err400('Método de pagamento inválido.');

    /* cartão: valida dados e marca a bandeira (nunca guarda o PAN) */
    let cartao = null;
    if (mtd === 'cartao') {
      cartao = validarCartao(cardData || {});
    }

    const anual = String(periodo || '').toLowerCase() === 'anual';
    const dias = anual ? 365 : 30;
    const nParc = anual
      ? Math.min(12, Math.max(1, parseInt(parcelas, 10) || 12))
      : 1;
    /* cartão à vista (1×) é aceito em qualquer período */
    const nParcFinal = mtd === 'cartao' && !anual
      ? Math.min(12, Math.max(1, parseInt(parcelas, 10) || 1))
      : nParc;
    const quantidade = anual ? 12 : 1;
    /* Sem desconto: o plano anual custa exatamente 12× o valor mensal. */
    const totalCents = Math.round(Number(plano.price_monthly || 0) * quantidade * 100);

    /* pendente reutilizável? */
    const agora = agoraMsISO();
    const existente = db.payments.find(p =>
      p.barbershop_id === shop.id && p.plan_id === plano.id &&
      p.billing_period === dias && (p.installments || 1) === nParcFinal &&
      (p.metodo || 'pix') === mtd &&
      p.status === 'pending' && p.expires_at > agora);
    if (existente) return pagamentoPublico(existente);

    const pag = {
      id: DB.proximoId(),
      barbershop_id: shop.id,
      plan_id: plano.id,
      billing_period: dias,
      installments: nParcFinal,
      amount_cents: totalCents,
      metodo: mtd,
      card_brand: cartao ? marcaDoCartao(cartao.numero) : null,
      card_last4: cartao ? cartao.numero.slice(-4) : null,
      status: 'pending',
      provider: chaveApi() ? 'abacatepay' : 'demo',
      abacate_id: null,
      br_code: '',
      qr_base64: '',
      created_at: agoraISO(),
      expires_at: new Date(Date.now() + EXPIRA_EM_SEG * 1000).toISOString()
    };

    if (mtd === 'cartao') {
      /* cartão NÃO é suportado pelo checkout transparente da AbacatePay;
         processamos localmente em modo teste (demo) até integrarmos o
         checkout hospedado. Sufixo da cobrança guarda apenas os 4 últimos. */
      pag.provider = 'demo';
      pag.dev_mode = true;
    } else if (pag.provider === 'abacatepay') {
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
      pag = db.payments.find(p => p.id == String(dados.metadata.payment_db_id));
    }
    if (!pag && dados.id) {
      pag = db.payments.find(p => p.abacate_id === dados.id);
    }
    if (!pag) return { ignored: true, motivo: 'cobranca_desconhecida' };
    const mudou = aplicarPagamento(pag);
    return { ok: true, payment_db_id: pag.id, applied: mudou };
  }

  function err400(msg) { throw { status: 400, error: msg }; }

  /**
   * A loja pode acessar o painel? O plano Free é sempre liberado
   * (leituras + edição do perfil da loja). Planos pagos exigem
   * trial vigente ou período pago corrente (inclusive cancelada
   * dentro do prazo — acesso encerra ao fim do período).
   */
  function acessoLiberado(shopId) {
    const db = DB._d();
    const hoje = DB.hojeISO();
    const sub = db.subscriptions.find(s => s.barbershop_id == shopId);
    const plano = sub && db.plans.find(p => p.id === sub.plan_id);
    if (plano && plano.is_free) return true;
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
