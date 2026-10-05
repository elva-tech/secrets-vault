import { BUILT_IN_ROLE_NAMES } from '@vault/shared';
import { loadEnv } from '../config/env.js';
import { PermissionRegistryService } from '../modules/roles/services/permission-registry.service.js';
import { RoleModel } from '../modules/roles/models/role.model.js';
import { UserRepository } from '../modules/users/repositories/user.repository.js';
import { PasswordService } from '../modules/auth/services/password.service.js';
import { logger } from '../config/logger.js';

export async function runBootstrap(): Promise<void> {
  const registry = new PermissionRegistryService();
  await registry.seedCatalogue();

  const superPermissions = registry.getSuperAdminPermissions();
  const businessAdminPermissions = registry.getBusinessAdminTenantAdminPermissions();
  await RoleModel.updateMany(
    { isBuiltIn: true, builtInKey: BUILT_IN_ROLE_NAMES.BUSINESS_ADMIN },
    { $set: { permissionKeys: businessAdminPermissions } },
  );

  await RoleModel.updateOne(
    { isBuiltIn: true, builtInKey: BUILT_IN_ROLE_NAMES.SUPER_ADMIN, tenantId: null },
    {
      $setOnInsert: {
        name: BUILT_IN_ROLE_NAMES.SUPER_ADMIN,
        isBuiltIn: true,
        builtInKey: BUILT_IN_ROLE_NAMES.SUPER_ADMIN,
        tenantId: null,
        permissionKeys: superPermissions,
        description: 'Platform super administrator',
      },
    },
    { upsert: true },
  );

  const env = loadEnv();
  if (env.SEED_SUPER_ADMIN_EMAIL && env.SEED_SUPER_ADMIN_PASSWORD) {
    const users = new UserRepository();
    const passwords = new PasswordService();
    const existing = await users.findByEmail(env.SEED_SUPER_ADMIN_EMAIL);
    if (!existing) {
      const passwordHash = await passwords.hash(env.SEED_SUPER_ADMIN_PASSWORD);
      await users.create({
        email: env.SEED_SUPER_ADMIN_EMAIL,
        passwordHash,
        displayName: 'Platform Super Admin',
        isPlatformSuperAdmin: true,
      });
      logger.info('Seeded platform super admin user');
    }
  }
}
