export const TENANT_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  return null;
}

export function validatePassword(password: string, min = 12): string | null {
  if (password.length < min) return `Password must be at least ${min} characters`;
  return null;
}

export function validateTenantSlug(slug: string): string | null {
  const s = slug.trim().toLowerCase();
  if (s.length < 2) return 'Slug must be at least 2 characters';
  if (s.length > 63) return 'Slug must be at most 63 characters';
  if (!TENANT_SLUG_REGEX.test(s)) {
    return 'Slug must use lowercase letters, numbers, and hyphens (not at start/end)';
  }
  return null;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
