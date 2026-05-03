import { describe, expect, it } from '@jest/globals';

import {
  evaluateGreetingMessage,
  isGreetingMessage,
  normalizeGreetingText,
} from '../utils/whatsappGreeting.js';

describe('whatsappGreeting', () => {
  it('normaliza texto removendo acentos, espacos extras e caixa', () => {
    expect(normalizeGreetingText('  OlÁ   ')).toBe('ola');
    expect(normalizeGreetingText('  BOM   DIA ')).toBe('bom dia');
  });

  it.each([
    ['Oi'],
    ['Olá'],
    ['ola'],
    ['bom dia'],
    ['boa tarde'],
    ['boa noite'],
    ['iae'],
    ['eai'],
    ['opa'],
    ['fala'],
    ['tudo bem'],
    ['hey'],
    ['hello'],
    ['  OI  '],
    ['   BOA   TARDE  '],
    ['oiii'],
    ['heyyy'],
    ['hellooo'],
    ['agendar'],
    ['marcar'],
    ['quero agendar'],
    ['horário'],
  ])('detecta saudacao valida: %s', (input) => {
    const result = evaluateGreetingMessage(input);

    expect(result.isGreeting).toBe(true);
    expect(result.rule).toBeTruthy();
    expect(result.normalizedText).toBeTruthy();
    expect(isGreetingMessage(input)).toBe(true);
  });

  it.each([
    ['quero marcar horario'],
    ['tudo bem? preciso de ajuda'],
    ['xpto'],
    ['12345'],
    [''],
    [null],
    [undefined],
  ])('nao detecta quando nao e saudacao: %s', (input) => {
    const result = evaluateGreetingMessage(input);

    expect(result.isGreeting).toBe(false);
    expect(result.rule).toBeNull();
    expect(isGreetingMessage(input)).toBe(false);
  });
});
