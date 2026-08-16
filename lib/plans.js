// Catálogo de planos — fonte da verdade do preço.
//
// O preço NUNCA vem do cliente: o navegador manda só o id do plano, e o valor da
// cobrança sai daqui. Caso contrário qualquer pessoa edita o JS e compra por R$ 0,01.

const UNIT_PRICE_CENTS = 990; // R$ 9,90 por conta de e-mail

const PLANS = {
  '20gb': {
    id: '20gb',
    label: '20 GB',
    storageGb: 20,
    accounts: 2,
    unitPriceCents: UNIT_PRICE_CENTS,
    totalCents: UNIT_PRICE_CENTS * 2, // R$ 19,80
  },
  '50gb': {
    id: '50gb',
    label: '50 GB',
    storageGb: 50,
    accounts: 5,
    unitPriceCents: UNIT_PRICE_CENTS,
    totalCents: UNIT_PRICE_CENTS * 5, // R$ 49,50
  },
};

const DEFAULT_PLAN_ID = '50gb';

function getPlan(id) {
  return PLANS[id] || PLANS[DEFAULT_PLAN_ID];
}

module.exports = { PLANS, DEFAULT_PLAN_ID, UNIT_PRICE_CENTS, getPlan };
