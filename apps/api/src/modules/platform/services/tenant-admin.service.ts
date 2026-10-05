import { TenantStatus, BUILT_IN_ROLE_NAMES, MembershipStatus } from '@vault/shared';
import { TenantRepository } from '../../tenant/repositories/tenant.repository.js';
import { UserRepository } from '../../users/repositories/user.repository.js';
import { TenantMembershipRepository } from '../../tenant/repositories/tenant-membership.repository.js';
import { RoleRepository } from '../../roles/repositories/role.repository.js';
import { PasswordService } from '../../auth/services/password.service.js';
import { HostnameTenantResolverService } from '../../tenant/services/hostname-tenant-resolver.service.js';
import { PermissionRegistryService } from '../../roles/services/permission-registry.service.js';

export class TenantAdminService {
  constructor(
    private readonly tenants = new TenantRepository(),
    private readonly users = new UserRepository(),
    private readonly memberships = new TenantMembershipRepository(),
    private readonly roles = new RoleRepository(),
    private readonly passwords = new PasswordService(),
    private readonly hostnameResolver = new HostnameTenantResolverService(),
    private readonly permissionRegistry = new PermissionRegistryService(),
  ) {}

  async listTenants() {
    const tenants = await this.tenants.listAll();
    return tenants.map((t) => this.toPublic(t));
  }

  async getTenantById(id: string) {
    const tenant = await this.tenants.findById(id);
    if (!tenant) return null;
    return this.toPublic(tenant);
  }

  async createTenant(input: {
    name: string;
    slug: string;
    plan?: string;
    businessAdmin: {
      email: string;
      password: string;
      displayName: string;
    };
  }) {
    const slug = input.slug.toLowerCase();
    const existing = await this.tenants.findBySlug(slug);
    if (existing) {
      throw new PlatformError('TENANT_SLUG_EXISTS', 'Tenant slug already exists');
    }

    const primaryDomain = this.hostnameResolver.buildTenantHostname(slug);
    const tenant = await this.tenants.create({
      name: input.name,
      slug,
      primaryDomain,
      plan: input.plan,
      status: TenantStatus.PENDING,
    });

    let user = await this.users.findByEmail(input.businessAdmin.email);
    if (!user) {
      const passwordHash = await this.passwords.hash(input.businessAdmin.password);
      user = await this.users.create({
        email: input.businessAdmin.email,
        passwordHash,
        displayName: input.businessAdmin.displayName,
      });
    }

    const businessAdminRole = await this.roles.createTenantRole({
      tenantId: tenant._id.toString(),
      name: BUILT_IN_ROLE_NAMES.BUSINESS_ADMIN,
      permissionKeys: this.permissionRegistry.getBusinessAdminTenantAdminPermissions(),
      isBuiltIn: true,
      builtInKey: BUILT_IN_ROLE_NAMES.BUSINESS_ADMIN,
      description: 'Tenant-level administrator',
    });

    await this.memberships.create({
      tenantId: tenant._id.toString(),
      userId: user._id.toString(),
      roleIds: [businessAdminRole._id.toString()],
      status: MembershipStatus.ACTIVE,
    });

    return this.toPublic(tenant);
  }

  async setTenantStatus(id: string, status: TenantStatus) {
    const updated = await this.tenants.updateStatus(id, status);
    if (!updated) {
      throw new PlatformError('NOT_FOUND', 'Tenant not found');
    }
    return this.toPublic(updated);
  }

  private toPublic(tenant: {
    _id: { toString(): string };
    name: string;
    slug: string;
    status: string;
    primaryDomain: string;
    plan?: string;
    settings?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      primaryDomain: tenant.primaryDomain,
      plan: tenant.plan,
      settings: tenant.settings ?? {},
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }
}

export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}
