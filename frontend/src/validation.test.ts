import { describe, it, expect } from 'vitest';
import { validateTenantSlug, validatePassword, validateEmail } from './lib/validation';

describe('validation helpers', () => {
  it('accepts valid tenant slugs', () => {
    expect(validateTenantSlug('elva')).toBeNull();
    expect(validateTenantSlug('acme-corp')).toBeNull();
  });

  it('rejects invalid tenant slugs', () => {
    expect(validateTenantSlug('a')).not.toBeNull();
    expect(validateTenantSlug('-bad')).not.toBeNull();
  });

  it('validates password length', () => {
    expect(validatePassword('short')).not.toBeNull();
    expect(validatePassword('twelvechars!')).toBeNull();
  });

  it('validates email', () => {
    expect(validateEmail('not-an-email')).not.toBeNull();
    expect(validateEmail('user@example.com')).toBeNull();
  });
});
