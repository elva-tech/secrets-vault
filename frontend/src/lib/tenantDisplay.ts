import { buildTenantHostname } from './hostname';

/** Turn a tenant slug into a readable organization label (no API required). */
export function humanizeTenantSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export type TenantWelcomeBranding = {
  slug: string;
  displayName: string;
  workspaceHostname: string;
  logoSrc: string;
  welcomeMessage: string;
  tagline: string;
};

const DEFAULT_LOGO = '/brand/ELVA_LOGO.png';

/** Relative app paths only — blocks javascript: and external URLs for logo src. */
export function isSafeRelativeBrandAsset(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('..')) return false;
  return /^\/[a-zA-Z0-9/_.-]+$/.test(path);
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

export function resolveTenantWelcomeBranding(
  slug: string,
  baseDomain: string,
  overrides?: Partial<Pick<TenantWelcomeBranding, 'displayName' | 'logoSrc' | 'welcomeMessage' | 'tagline'>>,
): TenantWelcomeBranding {
  const logoSrc =
    overrides?.logoSrc && isSafeRelativeBrandAsset(overrides.logoSrc)
      ? overrides.logoSrc
      : DEFAULT_LOGO;
  const displayName = overrides?.displayName?.trim() || humanizeTenantSlug(slug);
  return {
    slug,
    displayName,
    workspaceHostname: buildTenantHostname(slug, baseDomain),
    logoSrc,
    welcomeMessage:
      overrides?.welcomeMessage?.trim() ||
      `Welcome to the ${displayName} secrets workspace on Secrets Vault by ELVA.`,
    tagline:
      overrides?.tagline?.trim() ||
      'Centralized management of application credentials, environment secrets, and controlled access.',
  };
}
