// Adaptador de gateway PIX — interface + STUB.
//
// O PSP ainda não foi escolhido. Todo o resto do funil já funciona contra esta
// interface, então plugar o gateway real é implementar as duas funções abaixo e
// trocar a exportação no final — nenhum outro arquivo muda.
//
// Ao implementar o PSP real (Mercado Pago, Asaas, Efí, ...):
//
//   createPixCharge({ orderId, amountCents, description, payer })
//     -> { providerChargeId, qrCodePayload, qrCodeImage, expiresAt }
//      · payer.cpf vai SÓ para o PSP. Nunca logar, nunca mandar para o Meta.
//
//   verifyWebhook({ headers, rawBody })
//     -> { valid, orderId, status, paidAt, amountCents }
//      · OBRIGATÓRIO validar a assinatura (HMAC/x-signature) contra o segredo do PSP
//        ANTES de confiar no corpo. Sem isso qualquer pessoa forja um POST e injeta
//        vendas falsas no seu Pixel.

const crypto = require('crypto');

const STUB_EXPIRY_MS = 30 * 60 * 1000;

/**
 * STUB: devolve um "PIX copia e cola" sintético, claramente identificável.
 * Não gera cobrança de verdade e não recebe dinheiro.
 */
async function createPixCharge({ orderId, amountCents, description }) {
  const providerChargeId = `stub_${crypto.randomBytes(8).toString('hex')}`;

  const qrCodePayload = [
    '00020126STUB-NAO-E-UM-PIX-REAL',
    `52040000530398654${String(amountCents / 100).padStart(6, '0')}`,
    `5802BR5913HOSPEDA INFO6009SAO PAULO`,
    `62070503${orderId.slice(0, 8)}`,
    '6304STUB',
  ].join('');

  return {
    providerChargeId,
    qrCodePayload,
    qrCodeImage: null, // o PSP real devolve base64/URL do QR
    expiresAt: Date.now() + STUB_EXPIRY_MS,
    isStub: true,
    description,
  };
}

/**
 * STUB: sem PSP definido não existe assinatura para validar, então aceitamos o corpo
 * apenas quando STUB_WEBHOOK_SECRET bate — o suficiente para testar o fluxo local
 * sem deixar um endpoint aberto que qualquer um usa para forjar vendas.
 */
async function verifyWebhook({ headers, rawBody }) {
  const expected = process.env.STUB_WEBHOOK_SECRET || 'dev-stub-secret';
  const provided = headers['x-stub-signature'];

  if (!provided || provided !== expected) {
    return { valid: false };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { valid: false };
  }

  return {
    valid: true,
    orderId: payload.orderId,
    status: payload.status === 'paid' ? 'paid' : 'pending',
    paidAt: payload.paidAt || Date.now(),
    amountCents: payload.amountCents,
  };
}

module.exports = {
  createPixCharge,
  verifyWebhook,
  providerName: 'stub',
  isStub: true,
};
