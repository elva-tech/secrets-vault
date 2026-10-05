export type EncryptionContext = {
  tenantId: string;
  resourceType: 'vault_secret' | 'vault_file' | 'personal_secret' | 'personal_file';
  resourceId: string;
};

export type EncryptedEnvelope = {
  provider: string;
  keyId: string;
  algorithm: string;
  ciphertext: string;
  encryptedDek: string;
  iv: string;
  authTag: string;
};

export interface EncryptionProvider {
  readonly providerId: string;
  encrypt(plaintext: string, context: EncryptionContext): Promise<EncryptedEnvelope>;
  decrypt(envelope: EncryptedEnvelope, context: EncryptionContext): Promise<string>;
}
