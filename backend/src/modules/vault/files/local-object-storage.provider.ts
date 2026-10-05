import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from '../../../config/env.js';
import type { ObjectStorageProvider } from './object-storage.types.js';

export class LocalFilesystemObjectStorageProvider implements ObjectStorageProvider {
  private basePath: string | null = null;

  private async getBasePath(): Promise<string> {
    if (this.basePath) return this.basePath;
    const { VAULT_FILE_STORAGE_PATH } = loadEnv();
    this.basePath = path.resolve(VAULT_FILE_STORAGE_PATH);
    await mkdir(this.basePath, { recursive: true });
    return this.basePath;
  }

  private resolveKey(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/\.\./g, '');
    if (normalized.startsWith('/') || normalized.includes('..')) {
      throw new Error('Invalid storage key');
    }
    return normalized;
  }

  async putObject(key: string, data: Buffer): Promise<void> {
    const base = await this.getBasePath();
    const safe = this.resolveKey(key);
    const full = path.join(base, safe);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async getObject(key: string): Promise<Buffer> {
    const base = await this.getBasePath();
    const safe = this.resolveKey(key);
    return readFile(path.join(base, safe));
  }

  async deleteObject(key: string): Promise<void> {
    const base = await this.getBasePath();
    const safe = this.resolveKey(key);
    await unlink(path.join(base, safe)).catch(() => undefined);
  }
}
