const onlyDigitsRegex = /\D+/g;

const hasRepeatedDigits = (value: string) => /^(\d)\1+$/.test(value);

const calculateCpfCheckDigit = (baseDigits: string, factorStart: number) => {
  let total = 0;

  for (let index = 0; index < baseDigits.length; index += 1) {
    total += Number(baseDigits[index]) * (factorStart - index);
  }

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

const calculateCnpjCheckDigit = (baseDigits: string, factors: number[]) => {
  let total = 0;

  for (let index = 0; index < baseDigits.length; index += 1) {
    total += Number(baseDigits[index]) * factors[index];
  }

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

export const normalizeCpfCnpjDigits = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value.replace(onlyDigitsRegex, '');
};

export const formatCpfCnpj = (value: string | null | undefined): string => {
  const digits = normalizeCpfCnpjDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

export const isValidCpf = (value: string): boolean => {
  const digits = normalizeCpfCnpjDigits(value);

  if (digits.length !== 11 || hasRepeatedDigits(digits)) {
    return false;
  }

  const firstCheckDigit = calculateCpfCheckDigit(digits.slice(0, 9), 10);
  const secondCheckDigit = calculateCpfCheckDigit(digits.slice(0, 10), 11);

  return firstCheckDigit === Number(digits[9]) && secondCheckDigit === Number(digits[10]);
};

export const isValidCnpj = (value: string): boolean => {
  const digits = normalizeCpfCnpjDigits(value);

  if (digits.length !== 14 || hasRepeatedDigits(digits)) {
    return false;
  }

  const firstCheckDigit = calculateCnpjCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondCheckDigit = calculateCnpjCheckDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return firstCheckDigit === Number(digits[12]) && secondCheckDigit === Number(digits[13]);
};

export const isValidCpfCnpj = (value: string): boolean => {
  const digits = normalizeCpfCnpjDigits(value);

  if (digits.length === 11) {
    return isValidCpf(digits);
  }

  if (digits.length === 14) {
    return isValidCnpj(digits);
  }

  return false;
};
