import { Link, Outlet, useNavigate } from 'react-router-dom';
import { ElvaLogo } from '../components/brand/ElvaLogo';
import { useAuth } from '../auth/AuthContext';
import { DevContextBanner } from '../components/DevContextBanner';

export function PlatformShell() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="workspace workspace--platform">
      <aside className="workspace-sidebar">
        <ElvaLogo variant="dark" subtitle="Platform Administration" to="/platform" />
        <p className="workspace-sidebar-meta">{me?.user.email}</p>
        <nav className="workspace-nav" aria-label="Platform">
          <p className="workspace-nav-group">PLATFORM</p>
          <Link className="workspace-nav-link" to="/platform">Tenants</Link>
        </nav>
        <div className="workspace-sidebar-footer">
          <a className="workspace-nav-link" href="/">Public website</a>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <DevContextBanner />
        <main className="workspace-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
