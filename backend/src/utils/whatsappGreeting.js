/**
 * whatsappGreeting.js — CORRIGIDO
 *
 * Bug 2: Adicionados termos de intenção (agendar, marcar, horário, atendimento)
 * e saudações informais adicionais (alo, salve, tudo bom, bora, hi).
 * Isso garante que clientes que abrem direto com "quero agendar" ou "horário"
 * recebam a mensagem de boas-vindas em vez de silêncio.
 */

const GREETING_EXACT_RULES = new Map([
  // Saudações básicas
  ['oi', { canonicalGreeting: 'oi', rule: 'exact:oi' }],
  ['ola', { canonicalGreeting: 'ola', rule: 'exact:ola' }],
  ['oii', { canonicalGreeting: 'oi', rule: 'exact:oii' }],
  ['oiii', { canonicalGreeting: 'oi', rule: 'exact:oiii' }],
  ['bom dia', { canonicalGreeting: 'bom dia', rule: 'exact:bom_dia' }],
  ['boa tarde', { canonicalGreeting: 'boa tarde', rule: 'exact:boa_tarde' }],
  ['boa noite', { canonicalGreeting: 'boa noite', rule: 'exact:boa_noite' }],
  ['eai', { canonicalGreeting: 'eai', rule: 'exact:eai' }],
  ['e ai', { canonicalGreeting: 'eai', rule: 'exact:e_ai' }],
  ['iai', { canonicalGreeting: 'iai', rule: 'exact:iai' }],
  ['iae', { canonicalGreeting: 'iae', rule: 'exact:iae' }],
  ['eae', { canonicalGreeting: 'eae', rule: 'exact:eae' }],
  ['opa', { canonicalGreeting: 'opa', rule: 'exact:opa' }],
  ['fala', { canonicalGreeting: 'fala', rule: 'exact:fala' }],
  ['tudo bem', { canonicalGreeting: 'tudo bem', rule: 'exact:tudo_bem' }],
  ['tudo bom', { canonicalGreeting: 'tudo bom', rule: 'exact:tudo_bom' }],
  ['hey', { canonicalGreeting: 'hey', rule: 'exact:hey' }],
  ['hello', { canonicalGreeting: 'hello', rule: 'exact:hello' }],
  ['hi', { canonicalGreeting: 'hi', rule: 'exact:hi' }],
  ['alo', { canonicalGreeting: 'alo', rule: 'exact:alo' }],
  ['salve', { canonicalGreeting: 'salve', rule: 'exact:salve' }],
  ['bora', { canonicalGreeting: 'bora', rule: 'exact:bora' }],

  // Termos de intenção — clientes que abrem direto com a ação desejada
  ['agendar', { canonicalGreeting: 'agendar', rule: 'exact:agendar' }],
  ['marcar', { canonicalGreeting: 'marcar', rule: 'exact:marcar' }],
  ['quero agendar', { canonicalGreeting: 'agendar', rule: 'exact:quero_agendar' }],
  ['quero marcar', { canonicalGreeting: 'marcar', rule: 'exact:quero_marcar' }],
  ['horario', { canonicalGreeting: 'horario', rule: 'exact:horario' }],
  ['atendimento', { canonicalGreeting: 'atendimento', rule: 'exact:atendimento' }],
]);

const GREETING_REGEX_RULES = [
  {
    canonicalGreeting: 'oi',
    rule: 'regex:oi_repetition',
    pattern: /^o+i+$/,
  },
  {
    canonicalGreeting: 'ola',
    rule: 'regex:ola_repetition',
    pattern: /^o+l+a+$/,
  },
  {
    canonicalGreeting: 'bom dia',
    rule: 'regex:bom_dia_repetition',
    pattern: /^b+o+m+\s+d+i+a+$/,
  },
  {
    canonicalGreeting: 'boa tarde',
    rule: 'regex:boa_tarde_repetition',
    pattern: /^b+o+a+\s+t+a+r+d+e+$/,
  },
  {
    canonicalGreeting: 'boa noite',
    rule: 'regex:boa_noite_repetition',
    pattern: /^b+o+a+\s+n+o+i+t+e+$/,
  },
  {
    canonicalGreeting: 'eai',
    rule: 'regex:eai_repetition',
    pattern: /^e+a+i+$/,
  },
  {
    canonicalGreeting: 'iai',
    rule: 'regex:iai_repetition',
    pattern: /^i+a+i+$/,
  },
  {
    canonicalGreeting: 'iae',
    rule: 'regex:iae_repetition',
    pattern: /^i+a+e+$/,
  },
  {
    canonicalGreeting: 'opa',
    rule: 'regex:opa_repetition',
    pattern: /^o+p+a+$/,
  },
  {
    canonicalGreeting: 'fala',
    rule: 'regex:fala_repetition',
    pattern: /^f+a+l+a+$/,
  },
  {
    canonicalGreeting: 'tudo bem',
    rule: 'regex:tudo_bem_repetition',
    pattern: /^t+u+d+o+\s+b+e+m+$/,
  },
  {
    canonicalGreeting: 'tudo bom',
    rule: 'regex:tudo_bom_repetition',
    pattern: /^t+u+d+o+\s+b+o+m+$/,
  },
  {
    canonicalGreeting: 'hey',
    rule: 'regex:hey_repetition',
    pattern: /^h+e+y+$/,
  },
  {
    canonicalGreeting: 'hello',
    rule: 'regex:hello_repetition',
    pattern: /^h+e+l{2,}o+$/,
  },
  {
    canonicalGreeting: 'alo',
    rule: 'regex:alo_repetition',
    pattern: /^a+l+o+$/,
  },
];

const sanitizeTextValue = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

export const normalizeGreetingText = (text) => {
  const baseText = sanitizeTextValue(text);

  if (!baseText) {
    return '';
  }

  return baseText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos: "horário" → "horario", "olá" → "ola"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const evaluateGreetingMessage = (text) => {
  const originalText = sanitizeTextValue(text);
  const normalizedText = normalizeGreetingText(originalText);

  if (!normalizedText) {
    return {
      isGreeting: false,
      rule: null,
      canonicalGreeting: null,
      originalText,
      normalizedText,
    };
  }

  const exactRule = GREETING_EXACT_RULES.get(normalizedText);

  if (exactRule) {
    return {
      isGreeting: true,
      rule: exactRule.rule,
      canonicalGreeting: exactRule.canonicalGreeting,
      originalText,
      normalizedText,
    };
  }

  const regexRule = GREETING_REGEX_RULES.find(({ pattern }) => pattern.test(normalizedText));

  if (regexRule) {
    return {
      isGreeting: true,
      rule: regexRule.rule,
      canonicalGreeting: regexRule.canonicalGreeting,
      originalText,
      normalizedText,
    };
  }

  return {
    isGreeting: false,
    rule: null,
    canonicalGreeting: null,
    originalText,
    normalizedText,
  };
};

export const isGreetingMessage = (text) => evaluateGreetingMessage(text).isGreeting;