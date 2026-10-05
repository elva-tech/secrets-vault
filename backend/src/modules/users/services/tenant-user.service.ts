import { MembershipStatus } from '@vault/shared';
import { UserRepository } from '../repositories/user.repository.js';
import { TenantMembershipRepository } from '../../tenant/repositories/tenant-membership.repository.js';
import { PasswordService } from '../../auth/services/password.service.js';
import { RoleRepository } from '../../roles/repositories/role.repository.js';

export class TenantUserService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly memberships = new TenantMembershipRepository(),
    private readonly passwords = new PasswordService(),
    private readonly roles = new RoleRepository(),
  ) {}

  async listUsers(trustedTenantId: string) {
    const memberships = await this.memberships.listByTenant(trustedTenantId);
    const result = [];
    for (const m of memberships) {
      const user = await this.users.findById(m.userId.toString());
      if (!user) continue;
      result.push({
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        membership: {
          status: m.status,
          roleIds: m.roleIds.map((id) => id.toString()),
          joinedAt: m.joinedAt,
        },
      });
    }
    return result;
  }

  async createUser(
    trustedTenantId: string,
    input: {
      email: string;
      password: string;
      displayName: string;
      roleIds: string[];
    },
  ) {
    const roles = await this.roles.findByIdsWithinTenant(input.roleIds, trustedTenantId);
    if (roles.length !== input.roleIds.length) {
      throw new TenantUserError('INVALID_ROLES', 'One or more roles are invalid for this tenant');
    }

    let user = await this.users.findByEmail(input.email);
    if (!user) {
      const passwordHash = await this.passwords.hash(input.password);
      user = await this.users.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      });
    }

    const existing = await this.memberships.findByTenantAndUser(
      trustedTenantId,
      user._id.toString(),
    );
    if (existing) {
      throw new TenantUserError('MEMBERSHIP_EXISTS', 'User is already a member of this tenant');
    }

    await this.memberships.create({
      tenantId: trustedTenantId,
      userId: user._id.toString(),
      roleIds: input.roleIds,
      status: MembershipStatus.ACTIVE,
    });

    return {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
    };
  }
}

export class TenantUserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TenantUserError';
  }
}
