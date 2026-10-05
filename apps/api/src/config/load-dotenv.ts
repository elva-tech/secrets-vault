import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(apiRoot, '../..');

/** Repo root first, then apps/api — local file overrides shared defaults */
export function loadAppDotenv(): void {
  loadDotenv({ path: path.join(repoRoot, '.env') });
  // apps/api/.env overrides repo root for local API-specific values
  loadDotenv({ path: path.join(apiRoot, '.env'), override: true });
}
