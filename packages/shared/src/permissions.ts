/** Atomic permission catalogue — extend without changing authorization architecture */
export const PERMISSION_CATALOGUE = [
  // Applications (future phases)
  'application.view',
  'application.create',
  'application.edit',
  'application.delete',
  // Environments
  'environment.view',
  'environment.create',
  'environment.edit',
  'environment.delete',
  // Secrets
  'secret.view',
  'secret.create',
  'secret.edit',
  'secret.delete',
  'secret.reveal',
  'secret.copy',
  'secret.download',
  'secret.rotate',
  // Files
  'file.view',
  'file.upload',
  'file.edit',
  'file.delete',
  'file.download',
  // Access
  'access.request',
  'access.view',
  'access.approve',
  'access.reject',
  'policy.view',
  'policy.edit',
  // Users
  'user.view',
  'user.create',
  'user.edit',
  'user.disable',
  'user.delete',
  // Roles
  'role.view',
  'role.create',
  'role.edit',
  'role.delete',
  // Personal vault (owner-only enforced in services)
  'personal.secret.view',
  'personal.secret.create',
  'personal.secret.edit',
  'personal.secret.delete',
  'personal.secret.reveal',
  'personal.file.view',
  'personal.file.upload',
  'personal.file.download',
  'personal.file.delete',
  // Audit
  'audit.view',
  // Platform (Phase 1)
  'platform.tenant.view',
  'platform.tenant.create',
  'platform.tenant.update',
  'platform.tenant.activate',
  'platform.tenant.suspend',
  'platform.tenant.disable',
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOGUE)[number];

export const BUILT_IN_ROLE_NAMES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BUSINESS_ADMIN: 'BUSINESS_ADMIN',
} as const;

export type BuiltInRoleName =
  (typeof BUILT_IN_ROLE_NAMES)[keyof typeof BUILT_IN_ROLE_NAMES];
