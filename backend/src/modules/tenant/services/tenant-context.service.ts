import { TenantStatus } from '@vault/shared';
import { TenantRepository } from '../repositories/tenant.repository.js';
import type { TenantDocument } from '../models/tenant.model.js';

export type TrustedTenantContext = {
  tenantId: string;
  slug: string;
  status: TenantStatus;
  name: string;
};

export class TenantContextService {
  constructor(private readonly tenants = new TenantRepository()) {}

  async resolveTrustedTenantBySlug(slug: string): Promise<TrustedTenantContext | null> {
    const tenant = await this.tenants.findBySlug(slug);
    if (!tenant) return null;
    return this.toContext(tenant);
  }

  async getWithinTenant(id: string, trustedTenantId: string): Promise<TenantDocument | null> {
    if (id !== trustedTenantId) {
      return null;
    }
    return this.tenants.findById(trustedTenantId);
  }

  toContext(tenant: TenantDocument): TrustedTenantContext {
    return {
      tenantId: tenant._id.toString(),
      slug: tenant.slug,
      status: tenant.status as TenantStatus,
      name: tenant.name,
    };
  }
}
