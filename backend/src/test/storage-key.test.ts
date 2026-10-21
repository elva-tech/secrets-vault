import { describe, expect, it } from 'vitest';
import {
  buildApplicationVaultStorageKey,
  buildPersonalVaultStorageKey,
  logicalKeyToCloudinaryAsset,
  StorageKeyError,
} from '../modules/vault/files/storage-key.js';

const TENANT = '507f1f77bcf86cd799439011';
const APP = '507f1f77bcf86cd799439012';
const USER = '507f1f77bcf86cd799439013';
const FILE = '507f1f77bcf86cd799439014';

describe('storage key hierarchy', () => {
  it('maps application files by tenant, application, environment slug, and file id', () => {
    for (const slug of ['dev', 'test', 'stage', 'prod', 'qa-east']) {
      const key = buildApplicationVaultStorageKey({
        tenantId: TENANT,
        applicationId: APP,
        environmentSlug: slug,
        fileId: FILE,
      });
      expect(key).toBe(
        `tenants/${TENANT}/applications/${APP}/environments/${slug}/files/${FILE}`,
      );
      expect(key).not.toContain('@');
    }
  });

  it('isolates personal vault under tenant and user id', () => {
    const key = buildPersonalVaultStorageKey({
      tenantId: TENANT,
      userId: USER,
      fileId: FILE,
    });
    expect(key).toBe(`tenants/${TENANT}/users/${USER}/files/${FILE}`);
    expect(key).not.toContain('applications');
    expect(key).not.toContain('user@example.com');
  });

  it('rejects client-style path injection in segments', () => {
    expect(() =>
      buildApplicationVaultStorageKey({
        tenantId: '../evil',
        applicationId: APP,
        environmentSlug: 'prod',
        fileId: FILE,
      }),
    ).toThrow(StorageKeyError);
  });

  it('maps hierarchical keys to Cloudinary folder and public id', () => {
    const key = buildApplicationVaultStorageKey({
      tenantId: TENANT,
      applicationId: APP,
      environmentSlug: 'prod',
      fileId: FILE,
    });
    const asset = logicalKeyToCloudinaryAsset(key);
    expect(asset.folder).toBe(
      `tenants/${TENANT}/applications/${APP}/environments/prod/files`,
    );
    expect(asset.publicId).toBe(FILE);
    expect(asset.fullPublicId).toBe(
      `tenants/${TENANT}/applications/${APP}/environments/prod/files/${FILE}`,
    );
  });

  it('preserves legacy application key encoding for Cloudinary', () => {
    const legacy = `${TENANT}/${APP}/507f1f77bcf86cd799439099/${FILE}`;
    const asset = logicalKeyToCloudinaryAsset(legacy);
    expect(asset.fullPublicId).toBe(`secrets-vault/legacy/${legacy.replace(/\//g, '--')}`);
    expect(asset.folder).toBeUndefined();
  });

  it('preserves legacy personal key encoding for Cloudinary', () => {
    const legacy = `${TENANT}/personal/${USER}/${FILE}`;
    const asset = logicalKeyToCloudinaryAsset(legacy);
    expect(asset.fullPublicId).toContain('secrets-vault/legacy');
    expect(asset.fullPublicId).not.toContain('@');
  });
});
