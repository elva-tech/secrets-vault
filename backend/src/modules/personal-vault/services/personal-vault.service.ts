import path from 'node:path';
import mongoose from 'mongoose';
import { VaultItemType } from '@vault/shared';
import { getEncryptionProvider } from '../../vault/encryption/encryption-provider.factory.js';
import type { EncryptedEnvelope } from '../../vault/encryption/encryption.types.js';
import { getObjectStorageProvider } from '../../vault/files/object-storage.factory.js';
import { VaultItemRepository } from '../../vault/repositories/vault-item.repository.js';
import { SecretVersionRepository } from '../../vault/repositories/secret-version.repository.js';
import { VaultFileRepository } from '../../vault/repositories/vault-file.repository.js';
import { VaultDomainError } from '../../vault/services/vault-domain.error.js';
import type { SecretValueInput } from '../../vault/services/vault-secret.service.js';
import { loadEnv } from '../../../config/env.js';

const ALLOWED_EXTENSIONS = new Set(['.env', '.pem', '.key', '.json', '.yaml', '.yml', '.txt', '.zip', '.crt']);

export class PersonalVaultService {
  constructor(
    private readonly items = new VaultItemRepository(),
    private readonly versions = new SecretVersionRepository(),
    private readonly files = new VaultFileRepository(),
    private readonly encryption = getEncryptionProvider(),
    private readonly storage = getObjectStorageProvider(),
  ) {}

  assertOwner(actorUserId: string, ownerId: string): void {
    if (actorUserId !== ownerId) {
      throw new VaultDomainError('FORBIDDEN', 'Personal vault access denied');
    }
  }

  async listSecrets(tenantId: string, ownerId: string) {
    const rows = await this.items.listPersonal(tenantId, ownerId);
    return rows.map((i) => this.toSecretList(i));
  }

  async createSecret(
    tenantId: string,
    ownerId: string,
    input: { name: string; type: VaultItemType; description?: string; value: SecretValueInput },
  ) {
    this.assertOwner(ownerId, ownerId);
    const name =
      input.type === VaultItemType.KEY_VALUE
        ? (input.value as { key: string }).key
        : input.name;
    const item = await this.items.createPersonal({
      tenantId,
      name,
      type: input.type,
      description: input.description,
      ownerId,
      createdBy: ownerId,
    });
    const plaintext = this.serializeValue(input.type, input.value);
    const version = await this.createEncryptedVersion(
      tenantId,
      item._id.toString(),
      1,
      plaintext,
      ownerId,
      'Initial version',
    );
    await this.items.setCurrentVersion(item._id.toString(), tenantId, version._id.toString(), 1, ownerId);
    const fresh = await this.items.findPersonalSecretById(item._id.toString(), tenantId, ownerId);
    if (!fresh) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    return this.toSecretList(fresh);
  }

  async revealSecret(tenantId: string, ownerId: string, secretId: string) {
    const item = await this.requireSecret(tenantId, ownerId, secretId);
    if (!item.currentVersionId) throw new VaultDomainError('NOT_FOUND', 'Secret version not found');
    const version = await this.versions.findByIdWithinTenant(item.currentVersionId.toString(), tenantId);
    if (!version) throw new VaultDomainError('NOT_FOUND', 'Secret version not found');
    const plain = await this.encryption.decrypt(version.envelope as EncryptedEnvelope, {
      tenantId,
      resourceType: 'personal_secret',
      resourceId: secretId,
    });
    return { value: this.deserializeValue(item.type as VaultItemType, plain) };
  }

  async updateSecret(
    tenantId: string,
    ownerId: string,
    secretId: string,
    input: { value: SecretValueInput; reason?: string },
  ) {
    const item = await this.requireSecret(tenantId, ownerId, secretId);
    const versionNumber = await this.versions.nextVersionNumber(tenantId, secretId);
    const plaintext = this.serializeValue(item.type as VaultItemType, input.value);
    const version = await this.createEncryptedVersion(
      tenantId,
      secretId,
      versionNumber,
      plaintext,
      ownerId,
      input.reason ?? 'Updated',
    );
    await this.items.setCurrentVersion(secretId, tenantId, version._id.toString(), versionNumber, ownerId);
    return this.toSecretList(await this.requireSecret(tenantId, ownerId, secretId));
  }

  async deleteSecret(tenantId: string, ownerId: string, secretId: string) {
    await this.requireSecret(tenantId, ownerId, secretId);
    const deleted = await this.items.softDelete(secretId, tenantId, ownerId);
    if (!deleted) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    return { id: secretId, status: deleted.status };
  }

  async listFiles(tenantId: string, ownerId: string) {
    const rows = await this.files.listPersonal(tenantId, ownerId);
    return rows.map((r) => this.toFileList(r));
  }

  async uploadFile(
    tenantId: string,
    ownerId: string,
    input: { name: string; originalFilename: string; mimeType: string; buffer: Buffer },
  ) {
    const { VAULT_MAX_FILE_BYTES } = loadEnv();
    if (input.buffer.length > VAULT_MAX_FILE_BYTES) {
      throw new VaultDomainError('FILE_TOO_LARGE', 'File exceeds size limit');
    }
    this.validateFilename(input.originalFilename, input.mimeType);
    const pendingId = new mongoose.Types.ObjectId();
    const fileId = pendingId.toString();
    const storageKey = `${tenantId}/personal/${ownerId}/${fileId}`;
    const envelope = await this.encryption.encrypt(input.buffer.toString('base64'), {
      tenantId,
      resourceType: 'personal_file',
      resourceId: fileId,
    });
    await this.storage.putObject(storageKey, Buffer.from(envelope.ciphertext, 'base64'));
    const record = await this.files.createPersonal({
      id: fileId,
      tenantId,
      name: input.name,
      originalFilename: path.basename(input.originalFilename),
      mimeType: input.mimeType,
      size: input.buffer.length,
      ownerId,
      storageKey,
      envelope: { ...envelope, ciphertext: '' },
      createdBy: ownerId,
    });
    return this.toFileList(record);
  }

  async downloadFile(tenantId: string, ownerId: string, fileId: string) {
    const record = await this.files.findPersonalFileById(fileId, tenantId, ownerId);
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
      resourceType: 'personal_file',
      resourceId: fileId,
    });
    return {
      buffer: Buffer.from(plainB64, 'base64'),
      filename: record.originalFilename,
      mimeType: record.mimeType,
    };
  }

  async deleteFile(tenantId: string, ownerId: string, fileId: string) {
    const record = await this.files.findPersonalFileById(fileId, tenantId, ownerId);
    if (!record) throw new VaultDomainError('NOT_FOUND', 'File not found');
    await this.files.softDelete(fileId, tenantId, ownerId);
    await this.storage.deleteObject(record.storageKey).catch(() => undefined);
    return { id: fileId, status: 'DELETED' };
  }

  private async requireSecret(tenantId: string, ownerId: string, secretId: string) {
    const item = await this.items.findPersonalSecretById(secretId, tenantId, ownerId);
    if (!item) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    return item;
  }

  private async createEncryptedVersion(
    tenantId: string,
    secretId: string,
    versionNumber: number,
    plaintext: string,
    actorUserId: string,
    reason: string,
  ) {
    const envelope = await this.encryption.encrypt(plaintext, {
      tenantId,
      resourceType: 'personal_secret',
      resourceId: secretId,
    });
    return this.versions.createVersion({
      tenantId,
      secretId,
      versionNumber,
      envelope,
      createdBy: actorUserId,
      reason,
    });
  }

  private serializeValue(type: VaultItemType, value: SecretValueInput): string {
    if (type === VaultItemType.KEY_VALUE) {
      const v = value as { key: string; value: string };
      return JSON.stringify({ key: v.key, value: v.value });
    }
    if (type === VaultItemType.PASSWORD) {
      const v = value as { username?: string; password: string };
      return JSON.stringify({ username: v.username ?? '', password: v.password });
    }
    const v = value as { value: string };
    return JSON.stringify({ value: v.value });
  }

  private deserializeValue(type: VaultItemType, plain: string): unknown {
    const parsed = JSON.parse(plain) as Record<string, unknown>;
    if (type === VaultItemType.KEY_VALUE) return { key: parsed.key, value: parsed.value };
    if (type === VaultItemType.PASSWORD) {
      return { username: parsed.username, password: parsed.password };
    }
    return { value: parsed.value };
  }

  private validateFilename(originalFilename: string, mimeType: string) {
    const base = path.basename(originalFilename);
    if (!base || base.includes('..')) throw new VaultDomainError('INVALID_FILE', 'Invalid filename');
    const ext = path.extname(base).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new VaultDomainError('INVALID_FILE', 'File type not allowed');
    if (!mimeType || mimeType.length > 200) throw new VaultDomainError('INVALID_FILE', 'Invalid mime type');
  }

  private toSecretList(item: {
    _id: { toString(): string };
    name: string;
    type: string;
    description?: string;
    masked?: boolean;
    currentVersionNumber: number;
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: item._id.toString(),
      name: item.name,
      type: item.type,
      description: item.description,
      masked: true,
      currentVersionNumber: item.currentVersionNumber,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toFileList(record: {
    _id: { toString(): string };
    name: string;
    originalFilename: string;
    mimeType: string;
    size: number;
    status: string;
    createdAt?: Date;
  }) {
    return {
      id: record._id.toString(),
      name: record.name,
      originalFilename: record.originalFilename,
      mimeType: record.mimeType,
      size: record.size,
      masked: true,
      status: record.status,
      createdAt: record.createdAt,
    };
  }
}
