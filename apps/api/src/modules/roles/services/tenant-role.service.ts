import { PermissionRegistryService } from './permission-registry.service.js';
import { RoleRepository } from '../repositories/role.repository.js';

export class TenantRoleService {
  constructor(
    private readonly roles = new RoleRepository(),
    private readonly permissionRegistry = new PermissionRegistryService(),
  ) {}

  async listRoles(trustedTenantId: string) {
    const roles = await this.roles.listByTenant(trustedTenantId);
    return roles.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      isBuiltIn: r.isBuiltIn,
      builtInKey: r.builtInKey,
      permissionKeys: r.permissionKeys,
      description: r.description,
    }));
  }

  async createRole(
    trustedTenantId: string,
    input: { name: string; permissionKeys: string[]; description?: string },
  ) {
    for (const key of input.permissionKeys) {
      if (!PermissionRegistryService.isValidKey(key)) {
        throw new TenantRoleError('INVALID_PERMISSION', `Invalid permission: ${key}`);
      }
      if (key.startsWith('platform.')) {
        throw new TenantRoleError('INVALID_PERMISSION', 'Platform permissions cannot be assigned');
      }
    }

    const role = await this.roles.createTenantRole({
      tenantId: trustedTenantId,
      name: input.name,
      permissionKeys: input.permissionKeys,
      description: input.description,
    });

    return {
      id: role._id.toString(),
      name: role.name,
      permissionKeys: role.permissionKeys,
    };
  }
}

export class TenantRoleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TenantRoleError';
  }
}
