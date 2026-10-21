import path from 'node:path';
import mongoose from 'mongoose';
import type { EncryptedEnvelope } from '../encryption/encryption.types.js';
import { loadEnv } from '../../../config/env.js';
import { getEncryptionProvider } from '../encryption/encryption-provider.factory.js';
import { getObjectStorageProvider } from '../files/object-storage.factory.js';
import { buildApplicationVaultStorageKey } from '../files/storage-key.js';
import { VaultFileRepository } from '../repositories/vault-file.repository.js';
import { VaultScopeService } from './vault-scope.service.js';
import { VaultDomainError } from './vault-domain.error.js';
import { PolicyResourceType } from '@vault/shared';
import { AccessPolicyService } from '../../access-control/services/access-policy.service.js';
import { assertAllowedVaultUploadFilename } from '../files/vault-file-validation.js';

export class VaultFileService {
  constructor(
    private readonly files = new VaultFileRepository(),
    private readonly scope = new VaultScopeService(),
    private readonly encryption = getEncryptionProvider(),
    private readonly storage = getObjectStorageProvider(),
    private readonly accessPolicies = new AccessPolicyService(),
  ) {}

  async upload(
    tenantId: string,
    environmentId: string,
    applicationId: string,
    actorUserId: string,
    input: {
      name: string;
      originalFilename: string;
      mimeType: string;
      buffer: Buffer;
    },
  ) {
    const { VAULT_MAX_FILE_BYTES } = loadEnv();
    if (input.buffer.length > VAULT_MAX_FILE_BYTES) {
      throw new VaultDomainError('FILE_TOO_LARGE', 'File exceeds size limit');
    }
    assertAllowedVaultUploadFilename(input.originalFilename, input.mimeType);

    const { environment, application } = await this.scope.assertEnvironmentInTenant(
      tenantId,
      environmentId,
      applicationId,
    );

    const pendingId = new mongoose.Types.ObjectId();
    const fileId = pendingId.toString();
    const storageKey = buildApplicationVaultStorageKey({
      tenantId,
      applicationId: application._id.toString(),
      environmentSlug: environment.slug,
      fileId,
    });
    const envelope = await this.encryption.encrypt(input.buffer.toString('base64'), {
      tenantId,
      resourceType: 'vault_file',
      resourceId: fileId,
    });
    const encryptedBlob = Buffer.from(envelope.ciphertext, 'base64');
    await this.storage.putObject(storageKey, encryptedBlob);
    const envelopeMetadata = { ...envelope, ciphertext: '' };

    let record;
    try {
      record = await this.files.create({
      id: fileId,
      tenantId,
      applicationId: application._id.toString(),
      environmentId: environment._id.toString(),
      name: input.name,
      originalFilename: path.basename(input.originalFilename),
      mimeType: input.mimeType,
      size: input.buffer.length,
      ownerId: actorUserId,
      storageKey,
      envelope: envelopeMetadata,
      createdBy: actorUserId,
    });
    } catch (err) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw err;
    }

    await this.accessPolicies.ensureDefaultForResource(
      tenantId,
      PolicyResourceType.FILE,
      record._id.toString(),
    );

    return this.toPublic(record);
  }

  async listByEnvironment(tenantId: string, environmentId: string, applicationId: string) {
    await this.scope.assertEnvironmentInTenant(tenantId, environmentId, applicationId);
    const rows = await this.files.listByEnvironment(tenantId, environmentId);
    return rows.map((r) => this.toPublic(r));
  }

  async download(tenantId: string, fileId: string) {
    const record = await this.files.findApplicationFileById(fileId, tenantId);
    if (!record) throw new VaultDomainError('NOT_FOUND', 'File not found');

    const encryptedBlob = await this.storage.getObject(record.storageKey);
    if (!record.envelope) {
      throw new VaultDomainError('NOT_FOUND', 'File encryption metadata missing');
    }
    const envelope: EncryptedEnvelope = {
      provider: record.envelope.provider,
      keyId: record.envelope.keyId,
      algorithm: record.envelope.algorithm,
      encryptedDek: record.envelope.encryptedDek,
      iv: record.envelope.iv,
      authTag: record.envelope.authTag,
      ciphertext: encryptedBlob.toString('base64'),
    };
    const plainB64 = await this.encryption.decrypt(envelope, {
      tenantId,
      resourceType: 'vault_file',
      resourceId: fileId,
    });
    const buffer = Buffer.from(plainB64, 'base64');
    return {
      buffer,
      filename: record.originalFilename,
      mimeType: record.mimeType,
    };
  }

  async delete(tenantId: string, fileId: string, actorUserId: string) {
    const record = await this.files.findApplicationFileById(fileId, tenantId);
    if (!record) throw new VaultDomainError('NOT_FOUND', 'File not found');
    await this.files.softDelete(fileId, tenantId, actorUserId);
    await this.storage.deleteObject(record.storageKey).catch(() => undefined);
    return { id: fileId, status: 'DELETED' };
  }

  private toPublic(record: {
    _id: { toString(): string };
    name: string;
    originalFilename: string;
    mimeType: string;
    size: number;
    ownerId: { toString(): string };
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: record._id.toString(),
      name: record.name,
      originalFilename: record.originalFilename,
      mimeType: record.mimeType,
      size: record.size,
      ownerId: record.ownerId.toString(),
      status: record.status,
      masked: true,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
