/**
 * Logical object-storage keys (persisted in MongoDB as `storageKey`).
 * Server-generated only — never accept client-supplied paths.
 */

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const ENV_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export class StorageKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageKeyError';
  }
}

export function assertObjectIdSegment(value: string, label: string): string {
  if (!OBJECT_ID_PATTERN.test(value)) {
    throw new StorageKeyError(`Invalid ${label}`);
  }
  return value;
}

export function assertEnvironmentSlug(slug: string): string {
  const normalized = slug.toLowerCase().trim();
  if (!ENV_SLUG_PATTERN.test(normalized)) {
    throw new StorageKeyError('Invalid environment slug');
  }
  return normalized;
}

export function buildApplicationVaultStorageKey(input: {
  tenantId: string;
  applicationId: string;
  environmentSlug: string;
  fileId: string;
}): string {
  const tenantId = assertObjectIdSegment(input.tenantId, 'tenantId');
  const applicationId = assertObjectIdSegment(input.applicationId, 'applicationId');
  const fileId = assertObjectIdSegment(input.fileId, 'fileId');
  const environmentSlug = assertEnvironmentSlug(input.environmentSlug);
  return `tenants/${tenantId}/applications/${applicationId}/environments/${environmentSlug}/files/${fileId}`;
}

export function buildPersonalVaultStorageKey(input: {
  tenantId: string;
  userId: string;
  fileId: string;
}): string {
  const tenantId = assertObjectIdSegment(input.tenantId, 'tenantId');
  const userId = assertObjectIdSegment(input.userId, 'userId');
  const fileId = assertObjectIdSegment(input.fileId, 'fileId');
  return `tenants/${tenantId}/users/${userId}/files/${fileId}`;
}

/** New hierarchical keys (tenant resource tree). */
export function isHierarchicalStorageKey(key: string): boolean {
  return key.startsWith('tenants/');
}

/** Pre-hierarchy application vault key: `{tenantId}/{applicationId}/{environmentId}/{fileId}` */
export function isLegacyApplicationStorageKey(key: string): boolean {
  if (isHierarchicalStorageKey(key) || key.includes('/personal/')) return false;
  const parts = key.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length === 4 && parts.every((p) => OBJECT_ID_PATTERN.test(p));
}

/** Pre-hierarchy personal vault key: `{tenantId}/personal/{userId}/{fileId}` */
export function isLegacyPersonalStorageKey(key: string): boolean {
  if (isHierarchicalStorageKey(key)) return false;
  const parts = key.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length === 4 && parts[1] === 'personal' && OBJECT_ID_PATTERN.test(parts[0]!) && OBJECT_ID_PATTERN.test(parts[2]!) && OBJECT_ID_PATTERN.test(parts[3]!);
}

export type CloudinaryAssetRef = {
  folder?: string;
  publicId: string;
  fullPublicId: string;
};

function legacyCloudinaryPublicId(logicalKey: string): string {
  const normalized = logicalKey.replace(/\\/g, '/').replace(/\.\./g, '');
  return `secrets-vault/legacy/${normalized.replace(/\//g, '--')}`;
}

/**
 * Maps a logical storage key to Cloudinary folder/public_id fields.
 * Hierarchical keys use real folder paths; legacy keys keep the prior flat encoding.
 */
export function logicalKeyToCloudinaryAsset(logicalKey: string): CloudinaryAssetRef {
  const normalized = logicalKey.replace(/\\/g, '/').trim();
  if (!normalized || normalized.includes('..')) {
    throw new StorageKeyError('Invalid storage key');
  }

  if (isHierarchicalStorageKey(normalized)) {
    const parts = normalized.split('/').filter(Boolean);
    const filesIndex = parts.lastIndexOf('files');
    if (filesIndex < 0 || filesIndex !== parts.length - 2) {
      throw new StorageKeyError('Invalid hierarchical storage key');
    }
    const folder = parts.slice(0, filesIndex + 1).join('/');
    const publicId = parts[filesIndex + 1]!;
    assertObjectIdSegment(publicId, 'fileId');
    return { folder, publicId, fullPublicId: `${folder}/${publicId}` };
  }

  if (isLegacyApplicationStorageKey(normalized) || isLegacyPersonalStorageKey(normalized)) {
    const fullPublicId = legacyCloudinaryPublicId(normalized);
    return { publicId: fullPublicId, fullPublicId };
  }

  throw new StorageKeyError('Unrecognized storage key format');
}
