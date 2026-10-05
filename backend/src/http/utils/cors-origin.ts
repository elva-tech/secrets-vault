import type { Env } from '../../config/env.js';

/** True when browser Origin is allowed to supply X-Vault-Host (Vercel UI → Render API). */
export function isTrustedBrowserOrigin(origin: string | undefined, env: Env): boolean {
  if (!origin) return false;
  return isAllowedWebOrigin(origin, env);
}

/** Origin or Referer from an allowed vault UI (some same-origin /api proxies omit Origin). */
export function isTrustedBrowserRequest(
  origin: string | undefined,
  referer: string | undefined,
  env: Env,
): boolean {
  if (isTrustedBrowserOrigin(origin, env)) return true;
  if (!referer) return false;
  try {
    return isAllowedWebOrigin(new URL(referer).origin, env);
  } catch {
    return false;
  }
}

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
