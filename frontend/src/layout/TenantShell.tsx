import { Link, Outlet, useNavigate } from 'react-router-dom';
import { ElvaLogo } from '../components/brand/ElvaLogo';
import { useAuth } from '../auth/AuthContext';
import { DevContextBanner } from '../components/DevContextBanner';

function hasAnyPermission(permissions: string[] | undefined, keys: string[]): boolean {
  if (!permissions?.length) return false;
  return keys.some((k) => permissions.includes(k));
}

export function TenantShell() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const perms = me?.permissions;

  const showApps = hasAnyPermission(perms, ['application.view', 'application.create']);
  const showAccess = hasAnyPermission(perms, ['access.view', 'access.request', 'access.approve']);
  const showPersonal = hasAnyPermission(perms, [
    'personal.secret.view',
    'personal.secret.create',
    'personal.file.view',
  ]);
  const showAudit = perms?.includes('audit.view');
  const showUsers = perms?.includes('user.view');
  const showRoles = perms?.includes('role.view');

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="workspace workspace--tenant">
      <aside className="workspace-sidebar">
        <ElvaLogo variant="dark" to="/tenant" />
        {me?.tenant && (
          <p className="workspace-sidebar-meta">
            {me.tenant.name}
            <span className="workspace-sidebar-slug mono">{me.tenant.slug}</span>
          </p>
        )}
        <nav className="workspace-nav" aria-label="Workspace">
          <p className="workspace-nav-group">WORKSPACE</p>
          <Link className="workspace-nav-link" to="/tenant">Overview</Link>
          {showApps && <Link className="workspace-nav-link" to="/applications">Applications</Link>}

          <p className="workspace-nav-group">ACCESS MANAGEMENT</p>
          {showAccess && <Link className="workspace-nav-link" to="/access-requests">Access Requests</Link>}
          {showUsers && <Link className="workspace-nav-link" to="/tenant?tab=users">Users</Link>}
          {showRoles && <Link className="workspace-nav-link" to="/tenant?tab=roles">Roles</Link>}

          {showPersonal && (
            <>
              <p className="workspace-nav-group">PERSONAL</p>
              <Link className="workspace-nav-link" to="/personal-vault">Personal Vault</Link>
            </>
          )}

          {showAudit && (
            <>
              <p className="workspace-nav-group">GOVERNANCE</p>
              <Link className="workspace-nav-link" to="/audit">Audit Logs</Link>
            </>
          )}
        </nav>
        <div className="workspace-sidebar-footer">
          <p className="workspace-sidebar-meta">{me?.user.email}</p>
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
