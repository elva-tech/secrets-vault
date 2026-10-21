import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SECRET_LENGTH,
  generateSecureSecret,
  SecureRandomUnavailableError,
} from './secretGenerator';

describe('generateSecureSecret', () => {
  it('produces values of the default length', () => {
    const value = generateSecureSecret();
    expect(value.length).toBe(DEFAULT_SECRET_LENGTH);
  });

  it('uses an allowed character set', () => {
    const allowed = /^[A-Za-z0-9!@#$%&*+\-=?]+$/;
    const value = generateSecureSecret(40);
    expect(value).toMatch(allowed);
  });

  it('does not use Math.random', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const value = generateSecureSecret();
    expect(value.length).toBe(DEFAULT_SECRET_LENGTH);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('throws when crypto.getRandomValues is unavailable', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });
    expect(() => generateSecureSecret()).toThrow(SecureRandomUnavailableError);
    Object.defineProperty(globalThis, 'crypto', {
      value: original,
      configurable: true,
    });
  });

  it('rejects lengths below minimum validation threshold', () => {
    expect(() => generateSecureSecret(7)).toThrow(RangeError);
  });
});
