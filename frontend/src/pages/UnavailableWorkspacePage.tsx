import { Link } from 'react-router-dom';
import { ElvaLogo } from '../components/brand/ElvaLogo';

export function UnavailableWorkspacePage() {
  return (
    <div className="auth-layout">
      <div className="auth-layout-brand">
        <ElvaLogo variant="light" subtitle="Workspace unavailable" to="/" />
      </div>
      <div className="auth-panel card card--workspace">
        <h1>Workspace not available</h1>
        <p className="muted">
          This hostname does not match a configured tenant workspace. Check the URL or contact your administrator.
        </p>
        <Link className="btn btn-primary" to="/">Return home</Link>
      </div>
    </div>
  );
}
