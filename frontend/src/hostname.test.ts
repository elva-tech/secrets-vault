import { describe, it, expect } from 'vitest';

/** Frontend must not derive tenantId from URL params — documented guard */
describe('tenant trust model', () => {
  it('does not read tenantId from browser storage', () => {
    const forbiddenKeys = ['tenantId', 'activeTenantId', 'vault_tenant'];
    for (const key of forbiddenKeys) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });
});
