import { describe, it, expect } from 'vitest';
import { classifyHostname, buildTenantHostname, tenantSlugFromHostname } from './hostname';

const BASE = 'vault.elvatech.in';

describe('classifyHostname', () => {
  it('detects platform hosts', () => {
    expect(classifyHostname('vault.elvatech.in', BASE)).toBe('platform');
    expect(classifyHostname('www.vault.elvatech.in', BASE)).toBe('platform');
  });

  it('detects tenant hosts', () => {
    expect(classifyHostname('elva.vault.elvatech.in', BASE)).toBe('tenant');
    expect(tenantSlugFromHostname('elva.vault.elvatech.in', BASE)).toBe('elva');
  });

  it('rejects unknown hosts', () => {
    expect(classifyHostname('evil.example.com', BASE)).toBe('invalid');
  });

  it('builds tenant hostname from slug', () => {
    expect(buildTenantHostname('elva', BASE)).toBe('elva.vault.elvatech.in');
  });
});
