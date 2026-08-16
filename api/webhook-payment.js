// POST /api/webhook-payment -> confirmação de pagamento vinda do PSP.
//
// Esta é a metade SERVER-SIDE do rastreamento redundante. Se o Pixel do navegador
// falhar (ad blocker, extensão, rede), a venda ainda é contabilizada por aqui.
//
// Regras que não podem ser afrouxadas:
//   1. Verificar a assinatura ANTES de confiar no corpo. Endpoint sem verificação =
//      qualquer um forja vendas no seu Pixel.
//   2. Ser idempotente: PSP reenvia webhook. Sem isso a mesma venda entra várias vezes.
//   3. Nunca deixar uma falha de rastreamento derrubar a resposta 200 — se o CAPI
//      falhar, o PSP não deve ficar reenviando o webhook por causa disso.

const { getOrder, updateOrder } = require('../lib/storage.js');
const { verifyWebhook } = require('../lib/payment-provider.js');
const { sendEvent, buildUserData } = require('../lib/meta-capi.js');

function readRawBody(req) {
  // Alguns runtimes já entregam o corpo parseado; a assinatura precisa do texto cru.
  if (typeof req.rawBody === 'string') return Promise.resolve(req.rawBody);
  if (req.body && typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body));

  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const rawBody = await readRawBody(req);
  const result = await verifyWebhook({ headers: req.headers, rawBody });

  if (!result.valid) {
    console.warn('[webhook] assinatura inválida — ignorado');
    res.status(401).json({ error: 'assinatura_invalida' });
    return;
  }

  const order = await getOrder(result.orderId);
  if (!order) {
    // Em produção com storage em memória isso acontece SEMPRE. Ver lib/storage.js.
    console.error('[webhook] pedido não encontrado:', result.orderId);
    res.status(404).json({ error: 'pedido_nao_encontrado' });
    return;
  }

  if (result.status !== 'paid') {
    await updateOrder(order.id, { status: result.status });
    res.status(200).json({ ok: true, status: result.status });
    return;
  }

  // Idempotência: se já processamos este pagamento, não dispara o evento de novo.
  if (order.status === 'paid') {
    res.status(200).json({ ok: true, status: 'paid', duplicate: true });
    return;
  }

  await updateOrder(order.id, { status: 'paid', paidAt: result.paidAt });

  // ---- Purchase server-side (CAPI) -------------------------------------------
  // Mesmo event_id do Pixel -> o Meta deduplica e conta UMA venda.
  const tracking = order.tracking || {};

  const userData = buildUserData({
    email: tracking.email,
    phone: tracking.phone,
    externalId: order.id,
    fbp: tracking.fbp,
    fbc: tracking.fbc,
    ip: tracking.ip,
    userAgent: tracking.userAgent,
  });

  await sendEvent({
    eventName: 'Purchase',
    eventId: order.eventId,
    eventTime: result.paidAt,
    eventSourceUrl: tracking.pageUrl,
    userData,
    customData: {
      currency: 'BRL',
      value: Number((order.amountCents / 100).toFixed(2)),
      content_name: `E-mail profissional ${order.planId}`,
      content_ids: [order.planId],
      content_type: 'product',
    },
  });

  res.status(200).json({ ok: true, status: 'paid' });
};
