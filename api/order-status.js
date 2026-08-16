// GET /api/order-status?orderId=... -> status do pagamento (polling do cliente).
//
// O PIX é assíncrono: a pessoa paga no app do banco e o PSP avisa por webhook. O
// navegador fica perguntando aqui até virar "paid" — só nesse momento o Pixel dispara
// o Purchase. Nunca no clique do botão.

const { getOrder } = require('../lib/storage.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const orderId = url.searchParams.get('orderId');

  if (!orderId) {
    res.status(400).json({ error: 'order_id_ausente' });
    return;
  }

  const order = await getOrder(orderId);
  if (!order) {
    res.status(404).json({ error: 'pedido_nao_encontrado' });
    return;
  }

  // Devolve só o necessário para a tela e para o evento — nada de CPF ou tracking.
  res.status(200).json({
    orderId: order.id,
    status: order.status,
    eventId: order.eventId,
    amountCents: order.amountCents,
    planId: order.planId,
    domain: order.domain,
  });
};
