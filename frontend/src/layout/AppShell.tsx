import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DevContextBanner } from '../components/DevContextBanner';

export function AppShell() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <div>
          <strong>Secrets Vault</strong>
          <span className="muted" style={{ marginLeft: 12, color: '#cbd5e1' }}>
            {me?.tenant ? `Tenant: ${me.tenant.name} (${me.tenant.slug})` : 'Platform'}
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {me?.user.isPlatformSuperAdmin && me.session.scope === 'platform' && (
            <Link to="/platform" style={{ color: '#e2e8f0' }}>Super Admin</Link>
          )}
          <Link to="/applications" style={{ color: '#e2e8f0' }}>Applications</Link>
          <Link to="/access-requests" style={{ color: '#e2e8f0' }}>Access Requests</Link>
          <Link to="/audit" style={{ color: '#e2e8f0' }}>Audit Logs</Link>
          <Link to="/personal-vault" style={{ color: '#e2e8f0' }}>Personal Vault</Link>
          <Link to="/tenant" style={{ color: '#e2e8f0' }}>Settings</Link>
          <button type="button" className="secondary" onClick={() => void onLogout()}>
            Logout
          </button>
        </nav>
      </header>
      <DevContextBanner />
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
