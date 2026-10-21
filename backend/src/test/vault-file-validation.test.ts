import { describe, expect, it } from 'vitest';
import {
  assertAllowedVaultUploadFilename,
  isAllowedVaultUploadFilename,
} from '../modules/vault/files/vault-file-validation.js';
import { VaultDomainError } from '../modules/vault/services/vault-domain.error.js';

describe('vault file validation', () => {
  it('allows pdf and docx with spaces in filename', () => {
    expect(isAllowedVaultUploadFilename('Arun P N - Form 11.pdf')).toBe(true);
    expect(isAllowedVaultUploadFilename('report.docx')).toBe(true);
    assertAllowedVaultUploadFilename('Arun P N - Form 11.pdf', 'application/pdf');
    assertAllowedVaultUploadFilename('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('allows dotenv-style names', () => {
    assertAllowedVaultUploadFilename('.env.example', 'text/plain');
  });

  it('rejects executables and path traversal', () => {
    expect(() => assertAllowedVaultUploadFilename('evil.exe', 'application/octet-stream')).toThrow(VaultDomainError);
    expect(() => assertAllowedVaultUploadFilename('secret..txt', 'text/plain')).toThrow(VaultDomainError);
  });
});
