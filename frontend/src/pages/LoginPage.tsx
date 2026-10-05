import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';

function isBareLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function LoginPage() {
  const { refresh, me } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'tenant' | 'platform'>('tenant');
  const [error, setError] = useState<string | null>(null);
  const [baseDomain, setBaseDomain] = useState('vault.localhost');
  const [hostHint, setHostHint] = useState<string | null>(null);

  const port = window.location.port ? `:${window.location.port}` : '';

  useEffect(() => {
    void apiFetch<{ baseDomain: string }>('/api/config/public')
      .then((r) => {
        setBaseDomain(r.baseDomain);
        const h = window.location.hostname.toLowerCase();
        const base = r.baseDomain.toLowerCase();
        if (h === base || h === `www.${base}`) {
          setMode('platform');
        } else if (h.endsWith(`.${base}`)) {
          setMode('tenant');
        }
      })
      .catch(() => {
        /* use defaults */
      });
  }, []);

  useEffect(() => {
    if (isBareLocalHost(window.location.hostname)) {
      setHostHint(
        `Use http://${baseDomain}${port} for Super Admin or http://{tenant-slug}.${baseDomain}${port} for a tenant (e.g. elva.${baseDomain}).`,
      );
    } else {
      setHostHint(null);
    }
  }, [baseDomain, port]);

  if (me) {
    navigate('/', { replace: true });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isBareLocalHost(window.location.hostname)) {
      setError('Open the app using your platform or tenant hostname URL (see note below), not localhost.');
      return;
    }
    try {
      const path =
        mode === 'platform' ? '/api/auth/platform/login' : '/api/auth/tenant/login';
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      navigate(mode === 'platform' ? '/platform' : '/tenant', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="shell-main">
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">
          Context is resolved from the site hostname (platform vs tenant). One deployment serves all tenants.
        </p>
        {hostHint && (
          <div className="error-banner" style={{ background: '#fffbeb', color: '#78350f', borderColor: '#fde68a' }}>
            {hostHint}
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
        <form className="form" onSubmit={(e) => void onSubmit(e)}>
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
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={8}
            />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
