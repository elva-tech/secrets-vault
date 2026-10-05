import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(backendRoot, '..');

/** Optional repo-root .env, then backend/.env overrides (Render: set env in dashboard). */
export function loadAppDotenv(): void {
  loadDotenv({ path: path.join(repoRoot, '.env') });
  loadDotenv({ path: path.join(backendRoot, '.env'), override: true });
}
