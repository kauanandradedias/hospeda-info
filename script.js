document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('domain-form');
const resultsBox = document.getElementById('cert-results');
const submitBtn = form.querySelector('button[type="submit"]');

const STATUS_LABEL = {
  disponivel: 'Disponível',
  indisponivel: 'Indisponível',
  indeterminado: 'Não foi possível verificar',
};

const ERROR_MESSAGE = {
  email_invalido: 'Digite um e-mail para verificar.',
  apenas_dominios_br: 'Só verificamos domínios .br por enquanto (ex.: contato@seuescritorio.adv.br).',
};

function renderResults(results) {
  resultsBox.innerHTML = '';
  results.forEach(({ domain, status }, i) => {
    const row = document.createElement('div');
    row.className = 'cert-result-row';
    row.style.animationDelay = `${i * 120}ms`;

    const name = document.createElement('span');
    name.className = 'cert-result-domain';
    name.textContent = domain;

    const badge = document.createElement('span');
    badge.className = `cert-badge cert-badge--${status}`;
    badge.textContent = STATUS_LABEL[status] || STATUS_LABEL.indeterminado;

    row.append(name, badge);
    resultsBox.append(row);
  });
}

function renderError(message) {
  resultsBox.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'cert-error';
  p.textContent = message;
  resultsBox.append(p);
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('is-loading', isLoading);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = form.elements['email'].value.trim();
  if (!email) return;

  setLoading(true);
  resultsBox.innerHTML = '';

  try {
    const res = await fetch('/api/check-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      renderError(ERROR_MESSAGE[data.error] || 'Não foi possível verificar agora. Tente novamente em instantes.');
      return;
    }

    renderResults(data.results);
  } catch {
    renderError('Falha de conexão. Verifique sua internet e tente novamente.');
  } finally {
    setLoading(false);
  }
});
