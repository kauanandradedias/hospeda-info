// Interface de persistência + adaptador EM MEMÓRIA.
//
// ⚠️  ATENÇÃO — LEIA ANTES DE IR PARA PRODUÇÃO
//
// O adaptador em memória funciona no dev-server local, mas NÃO funciona em produção
// serverless (Vercel/Netlify): cada invocação pode rodar numa instância nova, e o Map
// abaixo nasce vazio. Na prática isso quebra duas coisas:
//
//   1. O webhook de pagamento não acha o pedido -> o Purchase server-side (CAPI) sai
//      sem event_id/fbp/fbc -> o Meta conta a venda DUAS VEZES (ou com match ruim).
//   2. O cache do RDAP some -> muito mais consulta ao Registro.br -> rate-limit.
//
// Para consertar, implemente as mesmas 5 funções com Upstash Redis, Vercel KV ou
// Postgres e troque a exportação no final do arquivo. Nada mais no projeto muda.

const orders = new Map();
const cache = new Map();

// ---------------------------------------------------------------- pedidos

async function saveOrder(order) {
  orders.set(order.id, { ...order });
  return order;
}

async function getOrder(id) {
  const order = orders.get(id);
  return order ? { ...order } : null;
}

async function updateOrder(id, patch) {
  const current = orders.get(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  orders.set(id, next);
  return { ...next };
}

// ---------------------------------------------------------------- cache

async function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

async function setCache(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

module.exports = {
  saveOrder,
  getOrder,
  updateOrder,
  getCache,
  setCache,
  isEphemeral: true, // usado para avisar nos logs que isso não é produção
};
