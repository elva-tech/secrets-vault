/** Tenant-assignable permissions grouped for role UI (mirrors @vault/shared catalogue). */
export const TENANT_PERMISSION_GROUPS: Array<{
  label: string;
  permissions: Array<{ key: string; label: string }>;
}> = [
  {
    label: 'Applications',
    permissions: [
      { key: 'application.view', label: 'View' },
      { key: 'application.create', label: 'Create' },
      { key: 'application.edit', label: 'Edit' },
      { key: 'application.delete', label: 'Delete' },
    ],
  },
  {
    label: 'Environments',
    permissions: [
      { key: 'environment.view', label: 'View' },
      { key: 'environment.create', label: 'Create' },
      { key: 'environment.edit', label: 'Edit' },
      { key: 'environment.delete', label: 'Delete' },
    ],
  },
  {
    label: 'Secrets',
    permissions: [
      { key: 'secret.view', label: 'View' },
      { key: 'secret.create', label: 'Create' },
      { key: 'secret.edit', label: 'Edit' },
      { key: 'secret.delete', label: 'Delete' },
      { key: 'secret.reveal', label: 'Reveal' },
      { key: 'secret.copy', label: 'Copy' },
      { key: 'secret.download', label: 'Download' },
      { key: 'secret.rotate', label: 'Rotate' },
    ],
  },
  {
    label: 'Files',
    permissions: [
      { key: 'file.view', label: 'View' },
      { key: 'file.upload', label: 'Upload' },
      { key: 'file.edit', label: 'Edit' },
      { key: 'file.delete', label: 'Delete' },
      { key: 'file.download', label: 'Download' },
    ],
  },
  {
    label: 'Access',
    permissions: [
      { key: 'access.request', label: 'Request' },
      { key: 'access.view', label: 'View' },
      { key: 'access.approve', label: 'Approve' },
      { key: 'access.reject', label: 'Reject' },
      { key: 'policy.view', label: 'View policies' },
      { key: 'policy.edit', label: 'Edit policies' },
    ],
  },
  {
    label: 'Users',
    permissions: [
      { key: 'user.view', label: 'View' },
      { key: 'user.create', label: 'Create' },
      { key: 'user.edit', label: 'Edit' },
      { key: 'user.disable', label: 'Disable' },
      { key: 'user.delete', label: 'Delete' },
    ],
  },
  {
    label: 'Roles',
    permissions: [
      { key: 'role.view', label: 'View' },
      { key: 'role.create', label: 'Create' },
      { key: 'role.edit', label: 'Edit' },
      { key: 'role.delete', label: 'Delete' },
    ],
  },
  {
    label: 'Audit',
    permissions: [{ key: 'audit.view', label: 'View' }],
  },
  {
    label: 'Personal Vault',
    permissions: [
      { key: 'personal.secret.view', label: 'View secrets' },
      { key: 'personal.secret.create', label: 'Create secrets' },
      { key: 'personal.secret.edit', label: 'Edit secrets' },
      { key: 'personal.secret.delete', label: 'Delete secrets' },
      { key: 'personal.secret.reveal', label: 'Reveal secrets' },
      { key: 'personal.file.view', label: 'View files' },
      { key: 'personal.file.upload', label: 'Upload files' },
      { key: 'personal.file.download', label: 'Download files' },
      { key: 'personal.file.delete', label: 'Delete files' },
    ],
  },
];

export const ALL_TENANT_PERMISSION_KEYS = TENANT_PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export function permissionLabel(key: string): string {
  for (const group of TENANT_PERMISSION_GROUPS) {
    const found = group.permissions.find((p) => p.key === key);
    if (found) return `${group.label}: ${found.label}`;
  }
  return key;
}
