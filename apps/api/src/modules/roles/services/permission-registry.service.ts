import { PERMISSION_CATALOGUE, type PermissionKey } from '@vault/shared';
import { PermissionModel } from '../models/permission.model.js';

const CATEGORY_MAP: Record<string, string> = {
  application: 'Application',
  environment: 'Environment',
  secret: 'Secrets',
  file: 'Files',
  access: 'Access',
  user: 'Users',
  role: 'Roles',
  audit: 'Audit',
  platform: 'Platform',
};

export class PermissionRegistryService {
  static allKeys(): readonly PermissionKey[] {
    return PERMISSION_CATALOGUE;
  }

  static isValidKey(key: string): boolean {
    return (PERMISSION_CATALOGUE as readonly string[]).includes(key);
  }

  async seedCatalogue(): Promise<void> {
    for (const key of PERMISSION_CATALOGUE) {
      const categoryPrefix = key.split('.')[0] ?? 'other';
      const category = CATEGORY_MAP[categoryPrefix] ?? 'Other';
      await PermissionModel.updateOne(
        { key },
        { $setOnInsert: { key, category, description: key } },
        { upsert: true },
      );
    }
  }

  getSuperAdminPermissions(): PermissionKey[] {
    return PERMISSION_CATALOGUE.filter((k) => k.startsWith('platform.'));
  }

  getBusinessAdminTenantAdminPermissions(): PermissionKey[] {
    return PERMISSION_CATALOGUE.filter(
      (k) =>
        k.startsWith('user.') ||
        k.startsWith('role.') ||
        k.startsWith('application.') ||
        k.startsWith('environment.') ||
        k.startsWith('secret.') ||
        k.startsWith('file.') ||
        k.startsWith('access.') ||
        k.startsWith('policy.') ||
        k.startsWith('personal.') ||
        k.startsWith('audit.'),
    );
  }
}
