import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorageProvider } from '../modules/vault/files/object-storage.types.js';
import { VaultFileService } from '../modules/vault/services/vault-file.service.js';
import { buildApplicationVaultStorageKey } from '../modules/vault/files/storage-key.js';

const TENANT = '507f1f77bcf86cd799439011';
const APP = '507f1f77bcf86cd799439012';
const ENV_ID = '507f1f77bcf86cd799439099';
const FILE = '507f1f77bcf86cd799439014';

describe('Vault file upload storage', () => {
  it('uploads encrypted bytes, not plaintext', async () => {
    const putSpy = vi.fn(async (_key: string, data: Buffer) => {
      expect(data.toString('utf8')).not.toContain('plain-secret-bytes');
    });
    const storage: ObjectStorageProvider = {
      putObject: putSpy,
      getObject: async () => Buffer.from('cipher'),
      deleteObject: vi.fn(),
    };

    const service = new VaultFileService(
      undefined,
      undefined,
      undefined,
      storage,
      undefined,
    );

    vi.spyOn(service['scope'], 'assertEnvironmentInTenant').mockResolvedValue({
      environment: { _id: ENV_ID, slug: 'prod' },
      application: { _id: APP },
    } as never);
    vi.spyOn(service['files'], 'create').mockResolvedValue({
      _id: { toString: () => 'file1' },
      name: 'f',
      originalFilename: 'a.pem',
      mimeType: 'application/x-pem-file',
      size: 10,
      ownerId: { toString: () => 'u1' },
      status: 'ACTIVE',
    } as never);
    vi.spyOn(service['accessPolicies'], 'ensureDefaultForResource').mockResolvedValue(undefined as never);

    await service.upload(TENANT, ENV_ID, APP, '507f1f77bcf86cd799439013', {
      name: 'cert',
      originalFilename: 'cert.pem',
      mimeType: 'application/x-pem-file',
      buffer: Buffer.from('plain-secret-bytes'),
    });

    expect(putSpy).toHaveBeenCalledOnce();
    const actualKey = putSpy.mock.calls[0]![0] as string;
    expect(actualKey).toMatch(
      new RegExp(
        `^tenants/${TENANT}/applications/${APP}/environments/prod/files/[a-f0-9]{24}$`,
      ),
    );
    expect(actualKey).toBe(
      buildApplicationVaultStorageKey({
        tenantId: TENANT,
        applicationId: APP,
        environmentSlug: 'prod',
        fileId: actualKey.split('/').pop()!,
      }),
    );
  });

  it('removes orphaned storage when database create fails', async () => {
    const deleteSpy = vi.fn();
    const storage: ObjectStorageProvider = {
      putObject: async () => undefined,
      getObject: async () => Buffer.from(''),
      deleteObject: deleteSpy,
    };

    const service = new VaultFileService(
      undefined,
      undefined,
      undefined,
      storage,
      undefined,
    );

    vi.spyOn(service['scope'], 'assertEnvironmentInTenant').mockResolvedValue({
      environment: { _id: ENV_ID, slug: 'prod' },
      application: { _id: APP },
    } as never);
    vi.spyOn(service['files'], 'create').mockRejectedValue(new Error('db down'));

    await expect(
      service.upload(TENANT, ENV_ID, APP, '507f1f77bcf86cd799439013', {
        name: 'cert',
        originalFilename: 'cert.pem',
        mimeType: 'application/x-pem-file',
        buffer: Buffer.from('data'),
      }),
    ).rejects.toThrow();

    expect(deleteSpy).toHaveBeenCalledOnce();
  });
});

