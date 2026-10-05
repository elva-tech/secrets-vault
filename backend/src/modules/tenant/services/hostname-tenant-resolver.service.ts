import { loadEnv } from '../../../config/env.js';

export type TenantResolutionResult =
  | { kind: 'tenant'; slug: string; hostname: string }
  | { kind: 'platform'; hostname: string }
  | { kind: 'invalid'; hostname: string; reason: string };

/**
 * Resolves tenant context from the incoming hostname.
 * Pattern: {slug}.{VAULT_BASE_DOMAIN}
 * Platform (no tenant slug): bare VAULT_BASE_DOMAIN or www.VAULT_BASE_DOMAIN
 */
export class HostnameTenantResolverService {
  private readonly baseDomain: string;

  constructor(baseDomain?: string) {
    this.baseDomain = (baseDomain ?? loadEnv().VAULT_BASE_DOMAIN).toLowerCase();
  }

  getBaseDomain(): string {
    return this.baseDomain;
  }

  buildTenantHostname(slug: string): string {
    return `${slug.toLowerCase()}.${this.baseDomain}`;
  }

  resolve(hostname: string): TenantResolutionResult {
    const normalized = this.normalizeHostname(hostname);
    if (!normalized) {
      return { kind: 'invalid', hostname: hostname ?? '', reason: 'Missing hostname' };
    }

    const base = this.baseDomain;
    if (normalized === base || normalized === `www.${base}`) {
      return { kind: 'platform', hostname: normalized };
    }

    const suffix = `.${base}`;
    if (!normalized.endsWith(suffix)) {
      return {
        kind: 'invalid',
        hostname: normalized,
        reason: 'Hostname does not match configured base domain',
      };
    }

    const slugPart = normalized.slice(0, -suffix.length);
    if (!slugPart || slugPart.includes('.')) {
      return {
        kind: 'invalid',
        hostname: normalized,
        reason: 'Invalid tenant subdomain',
      };
    }

    const slug = slugPart.toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      return { kind: 'invalid', hostname: normalized, reason: 'Invalid tenant slug format' };
    }

    return { kind: 'tenant', slug, hostname: normalized };
  }

  private normalizeHostname(hostname: string): string | null {
    if (!hostname) return null;
    const withoutPort = hostname.split(':')[0]?.trim().toLowerCase();
    return withoutPort || null;
  }
}
