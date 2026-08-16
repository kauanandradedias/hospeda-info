// POST { name } -> sugestões de domínio agrupadas, com disponibilidade no Registro.br
//
// Recebe o NOME DO ESCRITÓRIO e devolve 4 candidatos agrupados por extensão.
// A consulta usa o RDAP público do Registro.br (rdap.registro.br), sucessor do WHOIS:
//   404 = domínio não encontrado -> disponível
//   200 = domínio encontrado     -> indisponível
//   qualquer outra coisa/erro    -> indeterminado
//
// IMPORTANTE: "indeterminado" NUNCA bloqueia o funil. Se o Registro.br cair, der
// timeout ou aplicar rate-limit, o candidato continua selecionável — perder uma venda
// por causa da instabilidade de um serviço de terceiro seria pior do que mostrar uma
// sugestão sem confirmação.

const { getCache, setCache } = require('../lib/storage.js');

const RDAP_TIMEOUT_MS = 6000;
const DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;

// Palavras que quase todo escritório tem no nome e que só poluiriam o domínio.
const STOPWORDS = new Set([
  'advocacia',
  'advogado',
  'advogados',
  'advogadas',
  'associados',
  'associadas',
  'sociedade',
  'escritorio',
  'consultoria',
  'juridica',
  'juridico',
  'e',
  'de',
  'da',
  'do',
  'das',
  'dos',
]);

function stripAccents(raw) {
  return raw
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.codePointAt(0);
      return code < 0x300 || code > 0x36f; // descarta marcas combinantes (acentos)
    })
    .join('');
}

/**
 * "Andrade & Souza Advocacia" -> "andradesouza"
 * Domínios .br não aceitam espaço nem "&"; juntamos as palavras significativas.
 */
function toBase(raw) {
  const words = stripAccents(String(raw))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);

  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  // Se o nome for só stopwords ("Advocacia Associados"), usa as palavras originais.
  const chosen = meaningful.length ? meaningful : words;

  return chosen.join('').slice(0, 40);
}

function buildCandidates(base) {
  // Só oferece a variação "...advogados" quando ela acrescenta algo: para
  // "Advocacia Associados" isso viraria "advocaciaassociadosadvogados", que ninguém
  // quer no cartão. Nesse caso ficamos só com o domínio base (e poupamos 2 consultas
  // ao Registro.br).
  const alreadyMentionsProfession = /advog|advocacia/.test(base);

  const suffixes = alreadyMentionsProfession ? [''] : ['', 'advogados'];

  return {
    advbr: suffixes.map((suffix) => `${base}${suffix}.adv.br`),
    combr: suffixes.map((suffix) => `${base}${suffix}.com.br`),
  };
}

async function checkOne(domain) {
  const cached = await getCache(`rdap:${domain}`);
  if (cached) return cached;

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

  // Resultado indeterminado não entra em cache: é falha temporária, e cachear
  // significaria repetir a mesma resposta ruim para todo mundo por 10 minutos.
  if (status !== 'indeterminado') {
    await setCache(`rdap:${domain}`, status, DOMAIN_CACHE_TTL_MS);
  }

  return status;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { name } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'nome_invalido' });
    return;
  }

  const base = toBase(name);
  if (!base) {
    res.status(400).json({ error: 'nome_invalido' });
    return;
  }

  const candidates = buildCandidates(base);
  const groups = {};

  for (const [group, domains] of Object.entries(candidates)) {
    groups[group] = [];
    for (const domain of domains) {
      // Sequencial de propósito: espaça as chamadas ao RDAP do Registro.br.
      const status = await checkOne(domain);
      groups[group].push({ domain, status });
    }
  }

  res.status(200).json({ base, groups });
};

module.exports.toBase = toBase;
