// Meta Conversions API — envio server-side de eventos.
//
// Por que isso existe: o Pixel roda no navegador do usuário e falha com frequência
// (ad blocker, extensão, rede ruim, iOS). O CAPI sai do servidor, então a venda é
// contabilizada mesmo quando o Pixel não carrega.
//
// DEDUPLICAÇÃO: o Meta junta o evento do Pixel e o do CAPI quando os dois têm o MESMO
// event_name + event_id. O event_id é gerado uma única vez na criação do pedido e
// guardado — o navegador usa em fbq(..., { eventID }) e o webhook usa aqui. Se os dois
// divergirem, a mesma venda é contada duas vezes e o ROAS fica errado.
//
// Variáveis de ambiente necessárias:
//   META_PIXEL_ID            id do pixel (o mesmo do index.html)
//   META_CAPI_ACCESS_TOKEN   token do dataset — SEGREDO, nunca vai para o cliente
//   META_TEST_EVENT_CODE     opcional, para aparecer em "Test Events" no painel

const crypto = require('crypto');

const GRAPH_VERSION = 'v21.0';

/** O Meta exige os dados pessoais em SHA-256, normalizados (minúsculo, sem espaço). */
function hash(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hashDigits(value) {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return undefined;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

/**
 * Monta o user_data. Quanto mais campos, melhor o match — mas:
 * O CPF NUNCA entra aqui. Não é parâmetro de match do Meta e é dado sensível (LGPD);
 * ele existe só para o PSP emitir a cobrança.
 */
function buildUserData({ email, phone, firstName, lastName, externalId, fbp, fbc, ip, userAgent }) {
  const userData = {
    em: hash(email),
    ph: hashDigits(phone),
    fn: hash(firstName),
    ln: hash(lastName),
    external_id: hash(externalId),
    fbp,
    fbc,
    client_ip_address: ip,
    client_user_agent: userAgent,
  };

  for (const key of Object.keys(userData)) {
    if (userData[key] === undefined) delete userData[key];
  }

  return userData;
}

/**
 * Envia um evento ao CAPI. Nunca lança: uma falha de rastreamento não pode derrubar
 * o webhook de pagamento (o pagamento é o que importa; o evento é observabilidade).
 */
async function sendEvent({ eventName, eventId, eventTime, eventSourceUrl, userData, customData }) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.warn(
      '[capi] META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN ausentes — evento NÃO enviado:',
      eventName,
      eventId
    );
    return { sent: false, reason: 'missing_credentials' };
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_id: eventId, // <- chave da deduplicação com o Pixel
        event_time: Math.floor((eventTime || Date.now()) / 1000),
        action_source: 'website',
        event_source_url: eventSourceUrl,
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[capi] falha ao enviar', eventName, res.status, JSON.stringify(body));
      return { sent: false, reason: 'http_error', status: res.status, body };
    }

    console.log('[capi] enviado', eventName, 'event_id=', eventId, JSON.stringify(body));
    return { sent: true, body };
  } catch (err) {
    console.error('[capi] erro de rede ao enviar', eventName, err.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { sendEvent, buildUserData, hash, hashDigits };
