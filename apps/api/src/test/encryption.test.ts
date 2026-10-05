import { describe, it, expect, beforeEach } from 'vitest';
import { DevelopmentEncryptionProvider } from '../modules/vault/encryption/development-encryption.provider.js';
import { resetEncryptionProvider } from '../modules/vault/encryption/encryption-provider.factory.js';
describe('Encryption provider', () => {
  beforeEach(() => {
    resetEncryptionProvider();
  });

  it('encrypts plaintext and stores non-plaintext ciphertext', async () => {
    const provider = new DevelopmentEncryptionProvider();
    const plain = 'super-secret-password';
    const envelope = await provider.encrypt(plain, {
      tenantId: 'tenant1',
      resourceType: 'vault_secret',
      resourceId: 'secret1',
    });
    expect(envelope.ciphertext).not.toBe(plain);
    expect(envelope.encryptedDek).toBeTruthy();
    expect(envelope.iv).toBeTruthy();
    expect(envelope.authTag).toBeTruthy();
    const decrypted = await provider.decrypt(envelope, {
      tenantId: 'tenant1',
      resourceType: 'vault_secret',
      resourceId: 'secret1',
    });
    expect(decrypted).toBe(plain);
  });

  it('fails decrypt with wrong encryption context', async () => {
    const provider = new DevelopmentEncryptionProvider();
    const envelope = await provider.encrypt('value', {
      tenantId: 'tenant1',
      resourceType: 'vault_secret',
      resourceId: 'secret1',
    });
    await expect(
      provider.decrypt(envelope, {
        tenantId: 'tenant2',
        resourceType: 'vault_secret',
        resourceId: 'secret1',
      }),
    ).rejects.toThrow();
  });

  it('does not persist plaintext in secret version documents', async () => {
    const provider = new DevelopmentEncryptionProvider();
    const envelope = await provider.encrypt('db-password', {
      tenantId: 't',
      resourceType: 'vault_secret',
      resourceId: 's',
    });
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('db-password');
    expect(envelope.encryptedDek).not.toEqual(envelope.ciphertext);
  });
});
