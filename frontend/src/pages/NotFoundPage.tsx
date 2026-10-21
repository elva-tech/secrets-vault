import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="auth-layout">
      <div className="auth-panel card card--workspace">
        <h1>Page not found</h1>
        <p className="muted">The page you requested does not exist.</p>
        <Link className="btn btn-primary" to="/">Go home</Link>
      </div>
    </div>
  );
}
