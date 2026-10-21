export function isBareLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export type HostContext = 'platform' | 'tenant' | 'invalid' | 'local';

/** Classify browser hostname against configured vault base domain (from API). */
export function classifyHostname(hostname: string, baseDomain: string): HostContext {
  const h = hostname.toLowerCase().split(':')[0];
  const base = baseDomain.toLowerCase();

  if (isBareLocalHost(h)) return 'local';

  if (h === base || h === `www.${base}`) return 'platform';

  const suffix = `.${base}`;
  if (!h.endsWith(suffix)) return 'invalid';

  const slugPart = h.slice(0, -suffix.length);
  if (!slugPart || slugPart.includes('.')) return 'invalid';

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slugPart)) return 'invalid';

  return 'tenant';
}

export function tenantSlugFromHostname(hostname: string, baseDomain: string): string | null {
  if (classifyHostname(hostname, baseDomain) !== 'tenant') return null;
  const h = hostname.toLowerCase().split(':')[0];
  const suffix = `.${baseDomain.toLowerCase()}`;
  return h.slice(0, -suffix.length);
}

export function buildTenantHostname(slug: string, baseDomain: string): string {
  return `${slug.toLowerCase()}.${baseDomain.toLowerCase()}`;
}

export function exampleTenantHostname(baseDomain: string): string {
  return `yourcompany.${baseDomain.toLowerCase()}`;
}
