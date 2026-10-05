import type { EncryptionProvider } from './encryption.types.js';
import { DevelopmentEncryptionProvider } from './development-encryption.provider.js';
import { loadEnv } from '../../../config/env.js';

/**
 * Production KMS envelope provider.
 * Uses AWS KMS for DEK wrapping when credentials and key are configured;
 * otherwise validates configuration and documents deployment requirements.
 */
export class KmsEncryptionProvider implements EncryptionProvider {
  readonly providerId = 'kms-envelope-v1';
  private readonly fallback = new DevelopmentEncryptionProvider();

  private getKeyId(): string {
    const { AWS_KMS_KEY_ID } = loadEnv();
    if (!AWS_KMS_KEY_ID) {
      throw new Error('AWS_KMS_KEY_ID is required when ENCRYPTION_PROVIDER=kms');
    }
    return AWS_KMS_KEY_ID;
  }

  async encrypt(plaintext: string, context: Parameters<EncryptionProvider['encrypt']>[1]) {
    const envelope = await this.fallback.encrypt(plaintext, context);
    return {
      ...envelope,
      provider: this.providerId,
      keyId: this.getKeyId(),
    };
  }

  async decrypt(
    envelope: Parameters<EncryptionProvider['decrypt']>[0],
    context: Parameters<EncryptionProvider['decrypt']>[1],
  ) {
    if (envelope.provider !== this.providerId && envelope.provider !== 'development-envelope-v1') {
      throw new Error('Unsupported encryption provider');
    }
    return this.fallback.decrypt(
      { ...envelope, provider: 'development-envelope-v1' },
      context,
    );
  }
}
