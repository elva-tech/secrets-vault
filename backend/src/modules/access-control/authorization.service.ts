import {
  AuthorizationDecision,
  BUILT_IN_ROLE_NAMES,
  type AuthorizeInput,
} from '@vault/shared';
import { UserRepository } from '../users/repositories/user.repository.js';
import { TenantMembershipRepository } from '../tenant/repositories/tenant-membership.repository.js';
import { RoleRepository } from '../roles/repositories/role.repository.js';
import { PermissionRegistryService } from '../roles/services/permission-registry.service.js';

export class AuthorizationService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly memberships = new TenantMembershipRepository(),
    private readonly roles = new RoleRepository(),
    private readonly permissionRegistry = new PermissionRegistryService(),
  ) {}

  async authorize(input: AuthorizeInput): Promise<AuthorizationDecision> {
    const { userId, tenantId, permission, resource } = input;

    if (!PermissionRegistryService.isValidKey(permission)) {
      return AuthorizationDecision.DENY;
    }

    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      return AuthorizationDecision.DENY;
    }

    if (permission.startsWith('platform.')) {
      if (!user.isPlatformSuperAdmin) {
        return AuthorizationDecision.DENY;
      }
      const superRole = await this.roles.findPlatformSuperAdminRole();
      if (!superRole?.permissionKeys.includes(permission)) {
        return AuthorizationDecision.DENY;
      }
      return AuthorizationDecision.ALLOW;
    }

    if (!tenantId) {
      return AuthorizationDecision.DENY;
    }

    if (resource?.tenantId && resource.tenantId !== tenantId) {
      return AuthorizationDecision.DENY;
    }

    const membership = await this.memberships.findActiveMembership(tenantId, userId);
    if (!membership) {
      return AuthorizationDecision.DENY;
    }

    const roleIds = membership.roleIds.map((id) => id.toString());
    const tenantRoles = await this.roles.findByIdsWithinTenant(roleIds, tenantId);
    const permissionKeys = new Set<string>();
    for (const role of tenantRoles) {
      for (const key of role.permissionKeys) {
        permissionKeys.add(key);
      }
    }

    if (permissionKeys.has(permission)) {
      return AuthorizationDecision.ALLOW;
    }

    return AuthorizationDecision.DENY;
  }

  async getEffectivePermissions(userId: string, tenantId: string): Promise<string[]> {
    const membership = await this.memberships.findActiveMembership(tenantId, userId);
    if (!membership) return [];
    const roleIds = membership.roleIds.map((id) => id.toString());
    const tenantRoles = await this.roles.findByIdsWithinTenant(roleIds, tenantId);
    const keys = new Set<string>();
    for (const role of tenantRoles) {
      for (const key of role.permissionKeys) {
        keys.add(key);
      }
    }
    return [...keys];
  }

  async isSuperAdmin(userId: string): Promise<boolean> {
    const user = await this.users.findById(userId);
    return Boolean(user?.isPlatformSuperAdmin);
  }

  async hasBuiltInRole(
    userId: string,
    tenantId: string,
    builtInKey: typeof BUILT_IN_ROLE_NAMES.BUSINESS_ADMIN,
  ): Promise<boolean> {
    const membership = await this.memberships.findActiveMembership(tenantId, userId);
    if (!membership) return false;
    const roleIds = membership.roleIds.map((id) => id.toString());
    const roles = await this.roles.findByIdsWithinTenant(roleIds, tenantId);
    return roles.some((r) => r.builtInKey === builtInKey);
  }
}
