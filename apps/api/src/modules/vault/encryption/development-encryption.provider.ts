import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { loadEnv } from '../../../config/env.js';
import type {
  EncryptedEnvelope,
  EncryptionContext,
  EncryptionProvider,
} from './encryption.types.js';

/**
 * Development envelope encryption (AES-256-GCM + per-value DEK).
 * NOT for production — replace with cloud KMS via EncryptionProvider in deployment.
 */
export class DevelopmentEncryptionProvider implements EncryptionProvider {
  readonly providerId = 'development-envelope-v1';
  private readonly keyId = 'dev-master';
  private masterKey: Buffer | null = null;

  private getMasterKey(): Buffer {
    if (this.masterKey) return this.masterKey;
    const { VAULT_ENCRYPTION_MASTER_KEY } = loadEnv();
    if (!VAULT_ENCRYPTION_MASTER_KEY) {
      throw new Error('VAULT_ENCRYPTION_MASTER_KEY is required for development encryption');
    }
    const raw = Buffer.from(VAULT_ENCRYPTION_MASTER_KEY, 'base64');
    if (raw.length !== 32) {
      throw new Error('VAULT_ENCRYPTION_MASTER_KEY must be 32 bytes (base64-encoded)');
    }
    this.masterKey = raw;
    return raw;
  }

  private deriveContextKey(context: EncryptionContext): Buffer {
    const master = this.getMasterKey();
    return createHash('sha256')
      .update(master)
      .update(context.tenantId)
      .update(context.resourceType)
      .update(context.resourceId)
      .digest();
  }

  private wrapDek(dek: Buffer, context: EncryptionContext): Buffer {
    const iv = randomBytes(12);
    const key = this.deriveContextKey(context);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  private unwrapDek(wrapped: Buffer, context: EncryptionContext): Buffer {
    const iv = wrapped.subarray(0, 12);
    const tag = wrapped.subarray(12, 28);
    const enc = wrapped.subarray(28);
    const key = this.deriveContextKey(context);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  }

  async encrypt(plaintext: string, context: EncryptionContext): Promise<EncryptedEnvelope> {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encryptedDek = this.wrapDek(dek, context);
    dek.fill(0);
    return {
      provider: this.providerId,
      keyId: this.keyId,
      algorithm: 'aes-256-gcm',
      ciphertext: ciphertext.toString('base64'),
      encryptedDek: encryptedDek.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  async decrypt(envelope: EncryptedEnvelope, context: EncryptionContext): Promise<string> {
    if (envelope.provider !== this.providerId) {
      throw new Error('Unsupported encryption provider');
    }
    const dek = this.unwrapDek(Buffer.from(envelope.encryptedDek, 'base64'), context);
    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    dek.fill(0);
    return plain;
  }
}
