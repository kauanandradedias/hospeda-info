// POST -> cria o pedido e a cobrança PIX.
//
// Aqui nasce o event_id que o Pixel (navegador) e o CAPI (webhook) vão compartilhar
// para deduplicar o Purchase. Também é aqui que guardamos fbp/fbc/UTMs, porque o
// webhook do PSP chega "seco" — sem cookie, sem User-Agent do usuário, sem UTM.

const crypto = require('crypto');
const { saveOrder, isEphemeral } = require('../lib/storage.js');
const { createPixCharge, isStub } = require('../lib/payment-provider.js');
const { isValidCPF } = require('../lib/cpf.js');
const { getPlan } = require('../lib/plans.js');

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || undefined;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { cpf, planId, domain, firmName, signature, tracking } = req.body || {};

  if (!isValidCPF(cpf)) {
    res.status(400).json({ error: 'cpf_invalido' });
    return;
  }

  const plan = getPlan(planId);
  const orderId = crypto.randomUUID();
  const eventId = crypto.randomUUID(); // <- compartilhado entre Pixel e CAPI

  let charge;
  try {
    charge = await createPixCharge({
      orderId,
      amountCents: plan.totalCents,
      description: `E-mail profissional ${plan.label} — ${domain || 'domínio a definir'}`,
      payer: { cpf }, // o CPF morre aqui: vai só para o PSP, não é persistido nem logado
    });
  } catch (err) {
    console.error('[create-order] falha ao gerar cobrança:', err.message);
    res.status(502).json({ error: 'falha_no_pagamento' });
    return;
  }

  await saveOrder({
    id: orderId,
    eventId,
    status: 'pending',
    planId: plan.id,
    amountCents: plan.totalCents,
    domain: domain || null,
    firmName: firmName || null,
    signature: signature || null,
    providerChargeId: charge.providerChargeId,
    // Contexto de atribuição, para o webhook conseguir montar um evento com match bom.
    tracking: {
      ...(tracking || {}),
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    },
    createdAt: Date.now(),
  });

  if (isEphemeral) {
    console.warn(
      '[create-order] storage em memória: em produção serverless o webhook NÃO vai achar o pedido',
      orderId
    );
  }

  res.status(200).json({
    orderId,
    eventId,
    amountCents: plan.totalCents,
    plan: { id: plan.id, label: plan.label, accounts: plan.accounts },
    pix: {
      payload: charge.qrCodePayload,
      image: charge.qrCodeImage,
      expiresAt: charge.expiresAt,
    },
    isStub: Boolean(isStub),
  });
};
