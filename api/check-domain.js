// Vercel serverless function (Node runtime): POST { email } -> disponibilidade do domínio no Registro.br
//
// O formulário pede o e-mail completo desejado (ex.: contato@seuescritorio.adv.br);
// aqui extraímos só a parte do domínio e consultamos o RDAP público do Registro.br
// (rdap.registro.br), o sucessor do WHOIS.
// 200 = domínio encontrado (indisponível) | 404 = não encontrado (disponível).
// Cacheamos em memória por alguns minutos para não estourar o limite de
// requisições por IP do Registro.br. Esse cache é por instância/efêmero — para
// produção com tráfego alto, troque por um KV externo (ex.: Upstash Redis).

const CACHE_TTL_MS = 10 * 60 * 1000;
const RDAP_TIMEOUT_MS = 6000;
const cache = new Map();

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+br$/;

function extractDomain(email) {
  const parts = String(email).trim().toLowerCase().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { error: 'email_invalido' };
  const domain = parts[1].replace(/\.+$/, '');
  return DOMAIN_RE.test(domain) ? { domain } : { error: 'apenas_dominios_br' };
}

async function checkOne(domain) {
  const cached = cache.get(domain);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.status;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);

  let status;
  try {
    const res = await fetch(`https://rdap.registro.br/domain/${domain}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: controller.signal,
    });

    if (res.status === 404) status = 'disponivel';
    else if (res.status === 200) status = 'indisponivel';
    else status = 'indeterminado';
  } catch {
    status = 'indeterminado';
  } finally {
    clearTimeout(timeout);
  }

  cache.set(domain, { status, at: Date.now() });
  return status;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'email_invalido' });
    return;
  }

  const { domain, error } = extractDomain(email);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  const status = await checkOne(domain);
  res.status(200).json({ results: [{ domain, status }] });
};
