import path from 'node:path';
import { VaultDomainError } from '../services/vault-domain.error.js';

/** Extensions permitted for application and personal vault encrypted files. */
export const VAULT_ALLOWED_EXTENSIONS = new Set([
  '.env',
  '.pem',
  '.key',
  '.json',
  '.yaml',
  '.yml',
  '.txt',
  '.zip',
  '.crt',
  '.cer',
  '.pfx',
  '.p12',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.md',
]);

/** Never allow executable or script payloads regardless of MIME. */
const VAULT_BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.vbs',
  '.ps1',
  '.sh',
  '.bash',
  '.jar',
  '.msi',
  '.dll',
  '.app',
  '.dmg',
  '.deb',
  '.rpm',
  '.iso',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.wsf',
]);

function isDotenvStyleFilename(base: string): boolean {
  const lower = base.toLowerCase();
  return lower === '.env' || lower.startsWith('.env.');
}

export function isAllowedVaultUploadFilename(base: string): boolean {
  const normalized = path.basename(base);
  if (isDotenvStyleFilename(normalized)) {
    return true;
  }
  const ext = path.extname(normalized).toLowerCase();
  if (VAULT_BLOCKED_EXTENSIONS.has(ext)) {
    return false;
  }
  return VAULT_ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Validates upload filenames for vault files (application + personal).
 * Extension policy is authoritative; MIME is length-checked only (browser MIME is not trusted).
 */
export function assertAllowedVaultUploadFilename(originalFilename: string, mimeType: string): void {
  const base = path.basename(originalFilename);
  if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
    throw new VaultDomainError('INVALID_FILE', 'Invalid filename');
  }
  if (!isAllowedVaultUploadFilename(base)) {
    throw new VaultDomainError('INVALID_FILE', 'File type not allowed');
  }
  if (!mimeType || mimeType.length > 200) {
    throw new VaultDomainError('INVALID_FILE', 'Invalid mime type');
  }
}
