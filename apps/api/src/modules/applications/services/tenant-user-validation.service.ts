import { MembershipStatus } from '@vault/shared';
import { TenantMembershipRepository } from '../../tenant/repositories/tenant-membership.repository.js';

export class TenantUserValidationService {
  constructor(private readonly memberships = new TenantMembershipRepository()) {}

  async assertActiveTenantMember(tenantId: string, userId: string): Promise<void> {
    const membership = await this.memberships.findActiveMembership(tenantId, userId);
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new ApplicationDomainError('INVALID_TENANT_USER', 'User is not an active tenant member');
    }
  }
}

export class ApplicationDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationDomainError';
  }
}
