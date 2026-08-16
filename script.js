document.getElementById('year').textContent = new Date().getFullYear();

// =====================================================================
// RASTREAMENTO — captura de UTM/fbclid e helpers de Pixel
// =====================================================================

const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
const TRACKING_STORAGE_KEY = 'hospeda_tracking';

/**
 * Lê utm_source, utm_medium etc., fbclid e gclid da URL de entrada, guarda em
 * sessionStorage (sobrevive a refresh) e limpa a URL visível — sem isso, um F5
 * no meio do funil perderia a atribuição da campanha do Meta Ads.
 */
function captureTracking() {
  const params = new URLSearchParams(window.location.search);
  const stored = JSON.parse(sessionStorage.getItem(TRACKING_STORAGE_KEY) || '{}');
  let changed = false;

  TRACKING_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) {
      stored[key] = value;
      changed = true;
    }
  });

  if (changed) {
    sessionStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(stored));
    const url = new URL(window.location.href);
    TRACKING_KEYS.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, '', url);
  }

  return stored;
}

function getStoredTracking() {
  return JSON.parse(sessionStorage.getItem(TRACKING_STORAGE_KEY) || '{}');
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Formato oficial do _fbc quando o cookie do Pixel ainda não existe. */
function buildFbc(fbclid) {
  const existing = getCookie('_fbc');
  if (existing) return existing;
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

/**
 * Dispara um evento no Pixel do navegador. Nunca lança: se o fbq não existir (Pixel
 * não configurado, ad blocker, falha de rede), só avisa no console — a venda ainda é
 * contabilizada pela Conversions API no servidor.
 */
function trackPixel(eventName, params, options) {
  if (typeof window.fbq !== 'function') {
    console.warn('[pixel] fbq indisponível — evento client-side não enviado:', eventName);
    return;
  }
  window.fbq('track', eventName, params, options);
}

captureTracking();

// =====================================================================
// CPF — validação e máscara (espelha lib/cpf.js; o servidor valida de novo)
// =====================================================================

function isValidCPF(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calcCheckDigit(9) === Number(digits[9]) && calcCheckDigit(10) === Number(digits[10]);
}

function formatCPF(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
  let out = parts.join('.');
  if (digits.length > 9) out += `-${digits.slice(9, 11)}`;
  return out;
}

// =====================================================================
// ESTADO E NAVEGAÇÃO ENTRE ETAPAS
// =====================================================================

const funnel = document.getElementById('funnel');
const steps = [...funnel.querySelectorAll('.funnel-step')];

const state = {
  firmName: '',
  domain: null,
  domainIsPlaceholder: false,
  signature: { name: 'Seu Nome', role: 'Advogado(a)' },
  order: null,
};

function showStep(name) {
  steps.forEach((step) => {
    step.hidden = step.dataset.step !== name;
  });
  const active = steps.find((step) => step.dataset.step === name);
  if (active) {
    active.setAttribute('tabindex', '-1');
    active.focus({ preventScroll: false });
  }
}

funnel.addEventListener('click', (event) => {
  const back = event.target.closest('[data-action]');
  if (!back) return;
  const action = back.dataset.action;
  if (action === 'back-to-busca') showStep('busca');
  if (action === 'back-to-resultados') showStep('resultados');
  if (action === 'back-to-preview') showStep('preview');
});

// =====================================================================
// ETAPA 1 — busca por nome do escritório
// =====================================================================

const STATUS_LABEL = {
  disponivel: 'Disponível',
  indisponivel: 'Já em uso',
  indeterminado: 'Não confirmado',
};

const searchForm = document.getElementById('search-form');
const searchFeedback = document.getElementById('search-feedback');
const searchBtn = searchForm.querySelector('button[type="submit"]');

function setLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle('is-loading', isLoading);
}

function renderFeedbackError(container, message) {
  container.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'cert-error';
  p.textContent = message;
  container.append(p);
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const userName = searchForm.elements.userName.value.trim();
  const name = searchForm.elements.firmName.value.trim();
  if (!userName || !name) return;

  setLoading(searchBtn, true);
  searchFeedback.innerHTML = '';

  try {
    const res = await fetch('/api/check-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();

    if (!res.ok) {
      renderFeedbackError(searchFeedback, 'Não conseguimos consultar agora. Tente novamente em instantes.');
      return;
    }

    state.firmName = name;
    state.signature.name = userName;
    renderDomainGroups(data.groups);
    showStep('resultados');
  } catch {
    renderFeedbackError(searchFeedback, 'Falha de conexão. Verifique sua internet e tente novamente.');
  } finally {
    setLoading(searchBtn, false);
  }
});

// =====================================================================
// ETAPA 2 — domínios sugeridos
// =====================================================================

const groupAdvbr = document.getElementById('group-advbr');
const groupCombr = document.getElementById('group-combr');
const domainForm = document.getElementById('domain-form');
const domainContinue = document.getElementById('domain-continue');

function renderDomainGroups(groups) {
  groupAdvbr.innerHTML = '';
  groupCombr.innerHTML = '';
  domainContinue.disabled = true;
  domainForm.querySelectorAll('input[name="domain"]').forEach((input) => {
    if (input.value !== '__later__') input.remove();
  });

  (groups.advbr || []).forEach((entry) => appendDomainOption(groupAdvbr, entry));
  (groups.combr || []).forEach((entry) => appendDomainOption(groupCombr, entry));
}

function appendDomainOption(container, { domain, status }) {
  const isDisabled = status === 'indisponivel';

  const label = document.createElement('label');
  label.className = 'domain-option';
  if (isDisabled) label.classList.add('is-disabled');

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'domain';
  input.value = domain;
  if (isDisabled) input.disabled = true;

  const name = document.createElement('span');
  name.className = 'domain-name mono';
  name.textContent = domain;

  const badge = document.createElement('span');
  badge.className = `cert-badge cert-badge--${status}`;
  badge.textContent = STATUS_LABEL[status] || STATUS_LABEL.indeterminado;

  label.append(input, name, badge);
  container.append(label);
}

domainForm.addEventListener('change', (event) => {
  if (event.target.name === 'domain') {
    domainContinue.disabled = !domainForm.querySelector('input[name="domain"]:checked');
  }
});

domainForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const checked = domainForm.querySelector('input[name="domain"]:checked');
  if (!checked) return;

  if (checked.value === '__later__') {
    state.domain = 'seuescritorio.adv.br';
    state.domainIsPlaceholder = true;
  } else {
    state.domain = checked.value;
    state.domainIsPlaceholder = false;
  }

  populatePreview();
  showStep('preview');
});

// =====================================================================
// ETAPA 3 — preview da assinatura
// =====================================================================

const previewFrom = document.getElementById('preview-from');
const signatureName = document.getElementById('signature-name');
const signatureRole = document.getElementById('signature-role');
const signatureFirm = document.getElementById('signature-firm');
const signatureDomain = document.getElementById('signature-domain');
const signatureEmail = document.getElementById('signature-email');
const goCheckoutBtn = document.getElementById('go-checkout');

function slugifyFirstName(raw) {
  const withoutAccents = String(raw || '')
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.codePointAt(0);
      return code < 0x300 || code > 0x36f; // descarta marcas combinantes (acentos)
    })
    .join('');

  const first = withoutAccents.toLowerCase().trim().split(/\s+/)[0];
  const clean = (first || '').replace(/[^a-z0-9]/g, '');
  return clean || 'contato';
}

function updateSignatureEmail() {
  const email = `${slugifyFirstName(signatureName.value)}@${state.domain}`;
  signatureEmail.textContent = email;
  previewFrom.textContent = email;
}

function populatePreview() {
  signatureName.value = state.signature.name;
  signatureFirm.textContent = state.firmName;
  signatureDomain.textContent = state.domainIsPlaceholder
    ? `${state.domain} (exemplo — você decide depois)`
    : state.domain;
  updateSignatureEmail();
}

signatureName.addEventListener('input', () => {
  state.signature.name = signatureName.value;
  updateSignatureEmail();
});
signatureRole.addEventListener('input', () => {
  state.signature.role = signatureRole.value;
});

goCheckoutBtn.addEventListener('click', () => showStep('checkout'));

// =====================================================================
// ETAPA 4 — checkout (CPF) e criação do pedido
// =====================================================================

const checkoutForm = document.getElementById('checkout-form');
const checkoutFeedback = document.getElementById('checkout-feedback');
const checkoutBtn = checkoutForm.querySelector('button[type="submit"]');
const cpfInput = document.getElementById('cpf');

cpfInput.addEventListener('input', () => {
  cpfInput.value = formatCPF(cpfInput.value);
});

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  checkoutFeedback.innerHTML = '';

  if (!isValidCPF(cpfInput.value)) {
    renderFeedbackError(checkoutFeedback, 'Digite um CPF válido.');
    return;
  }

  setLoading(checkoutBtn, true);

  const storedTracking = getStoredTracking();
  const tracking = {
    ...storedTracking,
    fbp: getCookie('_fbp'),
    fbc: buildFbc(storedTracking.fbclid),
    pageUrl: window.location.href,
  };

  try {
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpf: cpfInput.value,
        planId: '50gb',
        domain: state.domain,
        firmName: state.firmName,
        signature: state.signature,
        tracking,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const message = data.error === 'cpf_invalido' ? 'CPF inválido — confira os números.' : 'Não conseguimos gerar o pagamento agora. Tente novamente em instantes.';
      renderFeedbackError(checkoutFeedback, message);
      return;
    }

    state.order = data;
    populatePayment(data);

    trackPixel(
      'InitiateCheckout',
      { value: data.amountCents / 100, currency: 'BRL', content_name: `E-mail profissional ${data.plan.label}` }
    );

    showStep('pagamento');
    startPolling(data.orderId);
  } catch {
    renderFeedbackError(checkoutFeedback, 'Falha de conexão. Verifique sua internet e tente novamente.');
  } finally {
    setLoading(checkoutBtn, false);
  }
});

// =====================================================================
// ETAPA 5 — pagamento PIX e confirmação
// =====================================================================

const pixAmount = document.getElementById('pix-amount');
const pixPayload = document.getElementById('pix-payload');
const pixStatus = document.getElementById('pix-status');
const copyPixBtn = document.getElementById('copy-pix');

function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function populatePayment(order) {
  pixAmount.textContent = formatBRL(order.amountCents);
  pixPayload.textContent = order.pix.payload;
  pixStatus.innerHTML = '<span class="dot"></span> Aguardando pagamento…';
  pixStatus.classList.remove('pix-status--paid');
}

copyPixBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(pixPayload.textContent);
    const original = copyPixBtn.textContent;
    copyPixBtn.textContent = 'Copiado!';
    setTimeout(() => (copyPixBtn.textContent = original), 2000);
  } catch {
    console.warn('[pix] clipboard indisponível — selecione o código manualmente.');
  }
});

let pollTimer = null;

function startPolling(orderId) {
  let attempts = 0;
  const MAX_ATTEMPTS = 100; // ~5 min a cada 3s

  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    attempts += 1;

    if (attempts > MAX_ATTEMPTS) {
      clearInterval(pollTimer);
      pixStatus.textContent = 'Ainda não recebemos a confirmação. Se você já pagou, aguarde mais alguns instantes.';
      return;
    }

    try {
      const res = await fetch(`/api/order-status?orderId=${encodeURIComponent(orderId)}`);
      if (!res.ok) return; // hiccup de rede/servidor: tenta de novo no próximo tick

      const data = await res.json();
      if (data.status === 'paid') {
        clearInterval(pollTimer);
        onPaymentConfirmed(data);
      }
    } catch {
      // falha pontual de rede — próximo tick tenta de novo
    }
  }, 3000);
}

function onPaymentConfirmed(order) {
  pixStatus.textContent = 'Pagamento confirmado! Em instantes você recebe as instruções de acesso por e-mail.';
  pixStatus.classList.add('pix-status--paid');

  // Purchase client-side — SÓ dispara aqui, após confirmação real de pagamento,
  // nunca no clique de um botão. eventID igual ao usado pela Conversions API no
  // webhook, para o Meta deduplicar as duas vias e contar UMA venda.
  trackPixel(
    'Purchase',
    { value: order.amountCents / 100, currency: 'BRL', content_name: `E-mail profissional ${order.planId}` },
    { eventID: order.eventId }
  );
}
