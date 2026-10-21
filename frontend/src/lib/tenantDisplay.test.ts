import { describe, expect, it } from 'vitest';
import {
  humanizeTenantSlug,
  isSafeRelativeBrandAsset,
  resolveTenantWelcomeBranding,
} from './tenantDisplay';

describe('tenantDisplay', () => {
  it('humanizes slugs without hardcoding a tenant', () => {
    expect(humanizeTenantSlug('elva')).toBe('Elva');
    expect(humanizeTenantSlug('apna-cart')).toBe('Apna Cart');
  });

  it('builds branding from slug and base domain', () => {
    const b = resolveTenantWelcomeBranding('acme', 'vault.example.com');
    expect(b.displayName).toBe('Acme');
    expect(b.workspaceHostname).toBe('acme.vault.example.com');
    expect(b.logoSrc).toBe('/brand/ELVA_LOGO.png');
  });

  it('rejects unsafe logo paths', () => {
    expect(isSafeRelativeBrandAsset('https://evil.test/x.png')).toBe(false);
    expect(isSafeRelativeBrandAsset('/brand/ELVA_LOGO.png')).toBe(true);
  });
});
