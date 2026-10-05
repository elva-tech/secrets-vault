import type { Env } from '../../config/env.js';

/** Allow platform + tenant subdomains under VAULT_BASE_DOMAIN, plus configured WEB_ORIGIN. */
export function isAllowedWebOrigin(origin: string, env: Env): boolean {
  if (origin === env.WEB_ORIGIN) return true;
  try {
    const url = new URL(origin);
    const base = env.VAULT_BASE_DOMAIN.toLowerCase();
    const host = url.hostname.toLowerCase();
    if (host === base || host === `www.${base}`) return true;
    if (host.endsWith(`.${base}`)) return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
  } catch {
    return false;
  }
  return false;
}
