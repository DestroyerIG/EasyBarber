const ONLY_DIGITS_REGEX = /\D+/g;

const hasRepeatedDigits = (value) => {
  return /^(\d)\1+$/.test(value);
};

const calculateCpfCheckDigit = (baseDigits, factorStart) => {
  let total = 0;

  for (let index = 0; index < baseDigits.length; index += 1) {
    total += Number(baseDigits[index]) * (factorStart - index);
  }

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

const calculateCnpjCheckDigit = (baseDigits, factors) => {
  let total = 0;

  for (let index = 0; index < baseDigits.length; index += 1) {
    total += Number(baseDigits[index]) * factors[index];
  }

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

export const normalizeDocumentDigits = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).replace(ONLY_DIGITS_REGEX, '');
};

export const isValidCpf = (value) => {
  const digits = normalizeDocumentDigits(value);

  if (digits.length !== 11 || hasRepeatedDigits(digits)) {
    return false;
  }

  const firstCheckDigit = calculateCpfCheckDigit(digits.slice(0, 9), 10);
  const secondCheckDigit = calculateCpfCheckDigit(digits.slice(0, 10), 11);

  return firstCheckDigit === Number(digits[9]) && secondCheckDigit === Number(digits[10]);
};

export const isValidCnpj = (value) => {
  const digits = normalizeDocumentDigits(value);

  if (digits.length !== 14 || hasRepeatedDigits(digits)) {
    return false;
  }

  const firstCheckDigit = calculateCnpjCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondCheckDigit = calculateCnpjCheckDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return firstCheckDigit === Number(digits[12]) && secondCheckDigit === Number(digits[13]);
};

export const isValidCpfCnpj = (value) => {
  const digits = normalizeDocumentDigits(value);

  if (digits.length === 11) {
    return isValidCpf(digits);
  }

  if (digits.length === 14) {
    return isValidCnpj(digits);
  }

  return false;
};

export const normalizeCpfCnpj = (value) => {
  const digits = normalizeDocumentDigits(value);
  return isValidCpfCnpj(digits) ? digits : null;
};
