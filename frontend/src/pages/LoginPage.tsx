import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ElvaLogo } from '../components/brand/ElvaLogo';
import { classifyHostname, isBareLocalHost } from '../lib/hostname';
import { useVaultBaseDomain } from '../hooks/useVaultBaseDomain';
import { UnavailableWorkspacePage } from './UnavailableWorkspacePage';

export function LoginPage() {
  const { refresh, me } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { baseDomain, loading: configLoading } = useVaultBaseDomain();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'tenant' | 'platform'>('tenant');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hostHint, setHostHint] = useState<string | null>(null);

  const port = window.location.port ? `:${window.location.port}` : '';
  const sessionExpired = searchParams.get('session-expired') === '1';

  useEffect(() => {
    if (configLoading) return;
    const h = window.location.hostname.toLowerCase();
    const base = baseDomain.toLowerCase();
    const ctx = classifyHostname(h, base);
    if (ctx === 'platform') setMode('platform');
    else if (ctx === 'tenant') setMode('tenant');
  }, [baseDomain, configLoading]);

  useEffect(() => {
    if (isBareLocalHost(window.location.hostname)) {
      setHostHint(
        `Use http://${baseDomain}${port} for platform admin or http://{tenant-slug}.${baseDomain}${port} for a tenant workspace.`,
      );
    } else {
      setHostHint(null);
    }
  }, [baseDomain, port]);

  useEffect(() => {
    if (me) {
      navigate(mode === 'platform' ? '/platform' : '/tenant', { replace: true });
    }
  }, [me, mode, navigate]);

  if (!configLoading && classifyHostname(window.location.hostname, baseDomain) === 'invalid') {
    return <UnavailableWorkspacePage />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isBareLocalHost(window.location.hostname)) {
      setError('Open the app using your platform or tenant hostname URL (see note below), not localhost.');
      return;
    }
    setSubmitting(true);
    try {
      const path =
        mode === 'platform' ? '/api/auth/platform/login' : '/api/auth/tenant/login';
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const session = await refresh();
      if (!session) {
        setError(
          'Signed in but session was not saved. Use same-origin /api or set SESSION_COOKIE_SAMESITE=none on the API when using a split deploy.',
        );
        return;
      }
      navigate(mode === 'platform' ? '/platform' : '/tenant', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  const isPlatform = mode === 'platform';

  return (
    <div className="auth-layout">
      <div className="auth-layout-body">
        <div className="auth-layout-brand">
          <ElvaLogo
            variant="light"
            subtitle={isPlatform ? 'Platform Administration' : 'Workspace sign in'}
            to="/"
          />
          <p className="auth-layout-tagline">Secure secrets. Controlled access.</p>
        </div>
        <div className="auth-panel card card--auth surface-light">
          <h1>{isPlatform ? 'Platform Sign In' : 'Workspace Sign In'}</h1>
          <p className="muted">
            {isPlatform
              ? 'Sign in with your platform administrator credentials.'
              : 'Sign in with your tenant account for this workspace hostname.'}
          </p>
          {sessionExpired && (
            <div className="banner banner--warn">Your session ended. Please sign in again.</div>
          )}
          {hostHint && <div className="banner banner--warn">{hostHint}</div>}
          {error && <div className="error-banner">{error}</div>}
          <form className="form form-auth" onSubmit={(e) => void onSubmit(e)}>
            {isBareLocalHost(window.location.hostname) && (
              <label>
                Mode
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'tenant' | 'platform')}
                >
                  <option value="tenant">Tenant (Business Admin)</option>
                  <option value="platform">Platform (Super Admin)</option>
                </select>
              </label>
            )}
            <label>
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="auth-back">
            <Link to="/">← Back to website</Link>
          </p>
        </div>
      </div>
      <footer className="auth-footer">
        <p>© {new Date().getFullYear()} Secrets Vault by ELVA · An ELVA Tech product</p>
      </footer>
    </div>
  );
}
