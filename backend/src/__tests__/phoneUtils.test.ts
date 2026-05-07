/**
 * phoneUtils.test.ts — Unit tests for phoneUtils.ts
 */

import { describe, it, expect } from 'vitest';
import {
  stripToDigits,
  canonicalizePhone,
  isSelfMessage,
  extractPhoneFromJid,
  resolveAuthorPhone,
} from '../services/whatsapp/utils/phoneUtils.js';

// ── stripToDigits ─────────────────────────────────────────────────────────────

describe('stripToDigits', () => {
  it('removes non-digit chars', () => {
    expect(stripToDigits('+55 (83) 9963-11811')).toBe('55839963118 11'.replace(/\s/g, ''));
    expect(stripToDigits('+55 (83) 99631-1811')).toBe('558399631181 1'.replace(/\s/g, ''));
  });

  it('returns empty string for null/empty input', () => {
    expect(stripToDigits(null)).toBe('');
    expect(stripToDigits('')).toBe('');
    expect(stripToDigits(undefined)).toBe('');
  });

  it('returns digits unchanged', () => {
    expect(stripToDigits('5583996311811')).toBe('5583996311811');
  });
});

// ── canonicalizePhone ─────────────────────────────────────────────────────────

describe('canonicalizePhone', () => {
  // Core spec: both formats → same canonical
  it('83996311811 (11d, with 9) → 8396311811', () => {
    expect(canonicalizePhone('83996311811')).toBe('8396311811');
  });

  it('8396311811 (10d, without 9) stays 8396311811', () => {
    expect(canonicalizePhone('8396311811')).toBe('8396311811');
  });

  it('5583996311811 (13d E.164 new) → 8396311811', () => {
    expect(canonicalizePhone('5583996311811')).toBe('8396311811');
  });

  // 12-digit number: 55 NOT stripped (intentional — see module header)
  it('558396311811 (12d E.164 old) stays 558396311811', () => {
    expect(canonicalizePhone('558396311811')).toBe('558396311811');
  });

  it('returns empty string for invalid input', () => {
    expect(canonicalizePhone(null)).toBe('');
    expect(canonicalizePhone('')).toBe('');
    expect(canonicalizePhone('abc')).toBe('');
  });

  it('handles + prefix and formatting', () => {
    expect(canonicalizePhone('+5583996311811')).toBe('8396311811');
  });
});

// ── isSelfMessage ─────────────────────────────────────────────────────────────

describe('isSelfMessage', () => {
  // THE critical case: client (12d) vs bot (13d) must be FALSE
  it('558396311811 (client, 12d) vs 5583996311811 (bot, 13d) → false', () => {
    expect(isSelfMessage('558396311811', '5583996311811')).toBe(false);
  });

  // Bot vs same bot (both 13d) → true
  it('same 13d number → true', () => {
    expect(isSelfMessage('5583996311811', '5583996311811')).toBe(true);
  });

  // 11d vs 13d same person → true
  it('83996311811 vs 5583996311811 → true (same person, different format)', () => {
    expect(isSelfMessage('83996311811', '5583996311811')).toBe(true);
  });

  // 10d vs 13d same person → true (after 9 removal both hit same canonical)
  it('8396311811 vs 5583996311811 → true', () => {
    expect(isSelfMessage('8396311811', '5583996311811')).toBe(true);
  });

  // Completely different numbers → false
  it('different numbers → false', () => {
    expect(isSelfMessage('5583996311811', '5511999887766')).toBe(false);
  });

  it('returns false for null/empty', () => {
    expect(isSelfMessage(null, '5583996311811')).toBe(false);
    expect(isSelfMessage('5583996311811', null)).toBe(false);
    expect(isSelfMessage('', '')).toBe(false);
  });

  // JID input handled gracefully (non-digits stripped)
  it('JID input: 5583996311811@s.whatsapp.net vs 5583996311811 → true', () => {
    expect(isSelfMessage('5583996311811@s.whatsapp.net', '5583996311811')).toBe(true);
  });
});

// ── extractPhoneFromJid ───────────────────────────────────────────────────────

describe('extractPhoneFromJid', () => {
  it('extracts phone from @s.whatsapp.net', () => {
    expect(extractPhoneFromJid('5583996311811@s.whatsapp.net')).toBe('5583996311811');
  });

  it('extracts phone from @c.us (legacy)', () => {
    expect(extractPhoneFromJid('5583996311811@c.us')).toBe('5583996311811');
  });

  it('returns null for @lid', () => {
    expect(extractPhoneFromJid('247269873942566@lid')).toBeNull();
  });

  it('returns null for @g.us (group)', () => {
    expect(extractPhoneFromJid('5511999999999@g.us')).toBeNull();
  });

  it('returns null for missing/empty', () => {
    expect(extractPhoneFromJid(null)).toBeNull();
    expect(extractPhoneFromJid('')).toBeNull();
    expect(extractPhoneFromJid('nojid')).toBeNull();
  });
});

// ── resolveAuthorPhone ────────────────────────────────────────────────────────

describe('resolveAuthorPhone', () => {
  it('fromMe=true → skip=true, phone=null', () => {
    const payload = { data: { key: { remoteJid: '5583996311811@s.whatsapp.net', fromMe: true } } };
    const r = resolveAuthorPhone(payload);
    expect(r.skip).toBe(true);
    expect(r.phone).toBeNull();
    expect(r.source).toBe('from_me');
  });

  it('remoteJid @s.whatsapp.net → phone from remoteJid', () => {
    const payload = { data: { key: { remoteJid: '558396311811@s.whatsapp.net', fromMe: false } } };
    const r = resolveAuthorPhone(payload);
    expect(r.phone).toBe('558396311811');
    expect(r.source).toBe('remoteJid');
    expect(r.skip).toBe(false);
  });

  it('remoteJid @g.us → skip (group)', () => {
    const payload = { data: { key: { remoteJid: '5511999999999@g.us', fromMe: false } } };
    const r = resolveAuthorPhone(payload);
    expect(r.skip).toBe(true);
    expect(r.source).toBe('group');
  });

  // Real Evolution API v1 @lid payload (from user's production log)
  it('@lid payload → phone from sender, skip=false', () => {
    const payload = {
      event: 'messages-upsert',
      instance: 'itallobarber_12f46de4',
      data: {
        key: {
          remoteJid: '247269873942566@lid',
          fromMe: false,
          id: 'ACCC752295081680F6CC2418A3504074',
          participant: null,
        },
        pushName: 'Lucas Barros',
        message: { conversation: 'Boa tarde' },
        messageType: 'conversation',
        messageTimestamp: 1777917946,
      },
      sender: '558396311811@s.whatsapp.net',
      destination: '5583996311811',
    };

    const r = resolveAuthorPhone(payload);
    expect(r.phone).toBe('558396311811');
    expect(r.source).toBe('sender_lid');
    expect(r.skip).toBe(false);

    // Confirm: this client is NOT the bot
    expect(isSelfMessage(r.phone, '5583996311811')).toBe(false);
  });

  it('@lid with participant → phone from participant', () => {
    const payload = {
      data: {
        key: {
          remoteJid: '247269873942566@lid',
          fromMe: false,
          participant: '5511999887766@s.whatsapp.net',
        },
      },
      sender: '558396311811@s.whatsapp.net',
    };
    const r = resolveAuthorPhone(payload);
    expect(r.phone).toBe('5511999887766');
    expect(r.source).toBe('participant_lid');
  });

  it('no resolvable source → skip=true, source=unresolved', () => {
    const r = resolveAuthorPhone({ data: { key: { fromMe: false } } });
    expect(r.skip).toBe(true);
    expect(r.source).toBe('unresolved');
  });
});
