import { PolicyResourceType, VaultItemType } from '@vault/shared';
import { AccessPolicyService } from '../../access-control/services/access-policy.service.js';
import { getEncryptionProvider } from '../encryption/encryption-provider.factory.js';
import { VaultItemRepository } from '../repositories/vault-item.repository.js';
import { SecretVersionRepository } from '../repositories/secret-version.repository.js';
import { VaultScopeService } from './vault-scope.service.js';
import { VaultDomainError } from './vault-domain.error.js';
import type { VaultItemDocument } from '../models/vault-item.model.js';
import type { EncryptedEnvelope } from '../encryption/encryption.types.js';

export type SecretValueInput =
  | { type: VaultItemType.KEY_VALUE; key: string; value: string }
  | { type: VaultItemType.PASSWORD; username?: string; password: string }
  | { type: VaultItemType.TEXT | VaultItemType.SECRET | VaultItemType.API_KEY | VaultItemType.TOKEN | VaultItemType.CERTIFICATE; value: string };

export class VaultSecretService {
  constructor(
    private readonly items = new VaultItemRepository(),
    private readonly versions = new SecretVersionRepository(),
    private readonly scope = new VaultScopeService(),
    private readonly encryption = getEncryptionProvider(),
    private readonly accessPolicies = new AccessPolicyService(),
  ) {}

  async create(
    tenantId: string,
    environmentId: string,
    applicationId: string,
    actorUserId: string,
    input: {
      name: string;
      type: VaultItemType;
      description?: string;
      value: SecretValueInput;
      ownerId?: string;
    },
  ) {
    const { environment, application } = await this.scope.assertEnvironmentInTenant(
      tenantId,
      environmentId,
      applicationId,
    );
    const ownerId = input.ownerId ?? actorUserId;
    const name = input.type === VaultItemType.KEY_VALUE
      ? (input.value as { key: string }).key
      : input.name;

    const item = await this.items.create({
      tenantId,
      applicationId: application._id.toString(),
      environmentId: environment._id.toString(),
      name,
      type: input.type,
      description: input.description,
      ownerId,
      createdBy: actorUserId,
    });

    const plaintext = this.serializeValue(input.type, input.value);
    const version = await this.createEncryptedVersion(
      tenantId,
      item._id.toString(),
      1,
      plaintext,
      actorUserId,
      'Initial version',
    );

    await this.items.setCurrentVersion(
      item._id.toString(),
      tenantId,
      version._id.toString(),
      1,
      actorUserId,
    );

    await this.accessPolicies.ensureDefaultForResource(
      tenantId,
      PolicyResourceType.SECRET,
      item._id.toString(),
    );

    const fresh = await this.items.findByIdWithinTenant(item._id.toString(), tenantId);
    if (!fresh) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    return this.toListItem(fresh);
  }

  async listByEnvironment(tenantId: string, environmentId: string, applicationId: string) {
    await this.scope.assertEnvironmentInTenant(tenantId, environmentId, applicationId);
    const items = await this.items.listByEnvironment(tenantId, environmentId);
    return items.map((i) => this.toListItem(i));
  }

  async getMetadata(tenantId: string, secretId: string) {
    const item = await this.requireItem(tenantId, secretId);
    return this.toDetailMetadata(item);
  }

  async updateValue(
    tenantId: string,
    secretId: string,
    actorUserId: string,
    input: { value: SecretValueInput; reason?: string; description?: string; name?: string },
  ) {
    const item = await this.requireItem(tenantId, secretId);
    const versionNumber = await this.versions.nextVersionNumber(tenantId, secretId);
    const plaintext = this.serializeValue(item.type as VaultItemType, input.value);
    const version = await this.createEncryptedVersion(
      tenantId,
      secretId,
      versionNumber,
      plaintext,
      actorUserId,
      input.reason ?? 'Updated',
    );
    await this.items.setCurrentVersion(
      secretId,
      tenantId,
      version._id.toString(),
      versionNumber,
      actorUserId,
    );
    if (input.description !== undefined || input.name !== undefined) {
      await this.items.updateMetadata(secretId, tenantId, {
        name: input.name,
        description: input.description,
        updatedBy: actorUserId,
      });
    }
    return this.getMetadata(tenantId, secretId);
  }

  async delete(tenantId: string, secretId: string, actorUserId: string) {
    const deleted = await this.items.softDelete(secretId, tenantId, actorUserId);
    if (!deleted) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    return { id: deleted._id.toString(), status: deleted.status };
  }

  async reveal(tenantId: string, secretId: string, actorUserId: string) {
    const item = await this.requireItem(tenantId, secretId);
    if (!item.currentVersionId) {
      throw new VaultDomainError('NOT_FOUND', 'Secret version not found');
    }
    const version = await this.versions.findByIdWithinTenant(
      item.currentVersionId.toString(),
      tenantId,
    );
    if (!version) throw new VaultDomainError('NOT_FOUND', 'Secret version not found');
    const plain = await this.encryption.decrypt(version.envelope as EncryptedEnvelope, {
      tenantId,
      resourceType: 'vault_secret',
      resourceId: secretId,
    });
    return { value: this.deserializeValue(item.type as VaultItemType, plain) };
  }

  async copy(tenantId: string, secretId: string, actorUserId: string) {
    return this.reveal(tenantId, secretId, actorUserId);
  }

  async listVersions(tenantId: string, secretId: string) {
    await this.requireItem(tenantId, secretId);
    const versions = await this.versions.listBySecret(tenantId, secretId);
    const item = await this.requireItem(tenantId, secretId);
    return versions.map((v) => ({
      id: v._id.toString(),
      versionNumber: v.versionNumber,
      createdBy: v.createdBy.toString(),
      createdAt: v.createdAt,
      reason: v.reason,
      isCurrent: item.currentVersionId?.toString() === v._id.toString(),
    }));
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
      resourceType: 'vault_secret',
      resourceId: secretId,
    });
    try {
      return await this.versions.createVersion({
        tenantId,
        secretId,
        versionNumber,
        envelope,
        createdBy: actorUserId,
        reason,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new VaultDomainError('VERSION_CONFLICT', 'Version conflict — retry update');
      }
      throw err;
    }
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
    if (type === VaultItemType.KEY_VALUE) {
      return { key: parsed.key, value: parsed.value };
    }
    if (type === VaultItemType.PASSWORD) {
      return { username: parsed.username, password: parsed.password };
    }
    return { value: parsed.value };
  }

  private async requireItem(tenantId: string, secretId: string) {
    const item = await this.items.findApplicationSecretById(secretId, tenantId);
    if (!item) throw new VaultDomainError('NOT_FOUND', 'Secret not found');
    return item;
  }

  private toListItem(item: VaultItemDocument) {
    return {
      id: item._id.toString(),
      name: item.name,
      type: item.type,
      description: item.description,
      ownerId: item.ownerId.toString(),
      status: item.status,
      masked: true,
      currentVersionNumber: item.currentVersionNumber,
      applicationId: item.applicationId?.toString() ?? null,
      environmentId: item.environmentId?.toString() ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toDetailMetadata(item: VaultItemDocument) {
    return {
      ...this.toListItem(item),
      accessPolicyId: item.accessPolicyId,
      rotationPolicyId: item.rotationPolicyId,
      currentVersionId: item.currentVersionId?.toString() ?? null,
    };
  }
}
