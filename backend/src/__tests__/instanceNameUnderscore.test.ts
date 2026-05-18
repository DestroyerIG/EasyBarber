import { describe, it, expect } from 'vitest';
import {
  buildDeterministicWhatsAppInstanceName,
  normalizeWhatsAppInstanceName,
} from '../services/whatsapp/whatsappInstanceService.js';

describe('buildDeterministicWhatsAppInstanceName — underscore invariant', () => {
  it('always includes a single underscore separator between slug and id suffix', () => {
    const name = buildDeterministicWhatsAppInstanceName({
      barbershopId: 'eacb8a07-1234-5678-9abc-def012345678',
      shopName: 'Itallo Barber',
    });
    // Suffix = last 8 chars of barbershopId stripped of non-alphanumerics.
    expect(name).toBe('itallo-barber_12345678');
    expect(name.split('_').length).toBeGreaterThanOrEqual(2);
  });

  it('preserves the underscore even with long shop names', () => {
    const name = buildDeterministicWhatsAppInstanceName({
      barbershopId: 'eacb8a07',
      shopName: 'Itallo Barber Premium Studio',
    });
    expect(name).toMatch(/_eacb8a07$/);
  });

  it('falls back to easybarber prefix when shop name is empty (still underscored)', () => {
    const name = buildDeterministicWhatsAppInstanceName({
      barbershopId: 'eacb8a07',
      shopName: '',
    });
    expect(name).toBe('easybarber_eacb8a07');
  });

  it('reproduces the production canonical name shape', () => {
    // Real production data shape that was being corrupted in logs:
    //   itallobarber_eacb8a07   (correct, kept by normalize)
    //   itallobarbereacb8a07    (corrupted zombie that must NOT be regenerated)
    const name = buildDeterministicWhatsAppInstanceName({
      barbershopId: 'eacb8a07',
      shopName: 'itallobarber',
    });
    expect(name).toBe('itallobarber_eacb8a07');
    expect(name).toContain('_');
  });
});

describe('normalizeWhatsAppInstanceName — does not destroy underscore', () => {
  it('keeps a single underscore intact', () => {
    expect(normalizeWhatsAppInstanceName('itallobarber_eacb8a07')).toBe('itallobarber_eacb8a07');
  });

  it('collapses runs of 2+ separator chars but never strips a single underscore', () => {
    expect(normalizeWhatsAppInstanceName('itallobarber__eacb8a07')).toBe('itallobarber-eacb8a07');
    expect(normalizeWhatsAppInstanceName('itallobarber_eacb8a07')).toBe('itallobarber_eacb8a07');
  });

  it('returns null for non-string input', () => {
    expect(normalizeWhatsAppInstanceName(null)).toBeNull();
    expect(normalizeWhatsAppInstanceName(undefined)).toBeNull();
  });

  it('does NOT spontaneously remove an underscore from a valid name', () => {
    // Regression: previous logs showed itallobarbereacb8a07 surfacing alongside
    // itallobarber_eacb8a07. Ensure no normalization step here can produce the
    // underscore-stripped form from valid input.
    const valid = 'itallobarber_eacb8a07';
    expect(normalizeWhatsAppInstanceName(valid)).toBe(valid);
    expect(normalizeWhatsAppInstanceName(valid)).not.toBe('itallobarbereacb8a07');
  });
});
