// Validação de CPF pelos dígitos verificadores.
// Usada no cliente (feedback imediato) e no servidor (o cliente é burlável).

function isValidCPF(raw) {
  const digits = String(raw || '').replace(/\D/g, '');

  if (digits.length !== 11) return false;
  // Rejeita 00000000000, 11111111111, etc. — passam na conta, mas não existem.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calcCheckDigit(9) === Number(digits[9]) && calcCheckDigit(10) === Number(digits[10]);
}

module.exports = { isValidCPF };
