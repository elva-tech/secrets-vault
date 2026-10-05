import { loadEnv } from '../../../config/env.js';
import type { EncryptionProvider } from './encryption.types.js';
import { DevelopmentEncryptionProvider } from './development-encryption.provider.js';
import { KmsEncryptionProvider } from './kms-encryption.provider.js';

let provider: EncryptionProvider | null = null;

export function getEncryptionProvider(): EncryptionProvider {
  if (!provider) {
    const { ENCRYPTION_PROVIDER } = loadEnv();
    provider =
      ENCRYPTION_PROVIDER === 'kms'
        ? new KmsEncryptionProvider()
        : new DevelopmentEncryptionProvider();
  }
  return provider;
}

export function resetEncryptionProvider(): void {
  provider = null;
}
