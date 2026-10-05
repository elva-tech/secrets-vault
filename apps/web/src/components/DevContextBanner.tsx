import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * Development-only helper: hostname-based context (no VITE_DEV_TENANT_HOST).
 */
export function DevContextBanner() {
  const { me } = useAuth();
  const [baseDomain, setBaseDomain] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;
    void fetch('/api/config/public', { credentials: 'include' })
      .then((r) => r.json())
      .then((r: { baseDomain?: string }) => setBaseDomain(r.baseDomain ?? null))
      .catch(() => setBaseDomain(null));
  }, []);

  if (!import.meta.env.DEV) return null;

  const host = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';

  if (host === 'localhost' || host === '127.0.0.1') {
    return (
      <div className="dev-banner">
        <strong>Local dev:</strong> Open a hostname URL instead of <code>localhost</code> — e.g.{' '}
        <code>http://vault.localhost{port}</code> (platform) or{' '}
        <code>http://elva.vault.localhost{port}</code> (tenant). The API uses that hostname; no per-tenant
        env vars.
      </div>
    );
  }

  return (
    <div className="dev-banner">
      <strong>Host:</strong> <code>{host}</code>
      {baseDomain && (
        <span>
          {' '}
          (under <code>{baseDomain}</code> — platform is <code>{baseDomain}</code> / <code>www.{baseDomain}</code>)
        </span>
      )}
      {me?.session.scope === 'platform' ? (
        <span> — platform session</span>
      ) : me?.tenant ? (
        <span> — tenant: <strong>{me.tenant.name}</strong></span>
      ) : null}
    </div>
  );
}
