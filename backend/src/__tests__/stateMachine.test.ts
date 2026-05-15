import { describe, it, expect } from 'vitest';
import { instanceStateTransition, type WhatsAppInstanceState } from '../services/whatsappClient.js';

describe('instanceStateTransition', () => {
  it('allows valid transition: not_created → creating', () => {
    expect(instanceStateTransition('not_created', 'creating')).toBe('creating');
  });

  it('allows valid transition: creating → initializing', () => {
    expect(instanceStateTransition('creating', 'initializing')).toBe('initializing');
  });

  it('allows valid transition: initializing → pairing', () => {
    expect(instanceStateTransition('initializing', 'pairing')).toBe('pairing');
  });

  it('allows valid transition: pairing → connected', () => {
    expect(instanceStateTransition('pairing', 'connected')).toBe('connected');
  });

  it('allows valid transition: connected → disconnected', () => {
    expect(instanceStateTransition('connected', 'disconnected')).toBe('disconnected');
  });

  it('allows valid transition: disconnected → reconnecting', () => {
    expect(instanceStateTransition('disconnected', 'reconnecting')).toBe('reconnecting');
  });

  it('allows valid transition: failed → creating', () => {
    expect(instanceStateTransition('failed', 'creating')).toBe('creating');
  });

  it('throws on invalid transition: connected → creating', () => {
    expect(() => instanceStateTransition('connected', 'creating')).toThrow(
      'Invalid state transition: connected → creating',
    );
  });

  it('throws on invalid transition: not_created → connected', () => {
    expect(() => instanceStateTransition('not_created', 'connected')).toThrow(
      'Invalid state transition',
    );
  });

  it('throws on invalid transition: destroyed → connected', () => {
    expect(() => instanceStateTransition('destroyed', 'connected')).toThrow(
      'Invalid state transition',
    );
  });

  it('allows any state to transition to failed via initializing', () => {
    const froms: WhatsAppInstanceState[] = ['initializing', 'pairing', 'qr_ready', 'connecting'];
    for (const from of froms) {
      expect(instanceStateTransition(from, 'failed')).toBe('failed');
    }
  });
});
