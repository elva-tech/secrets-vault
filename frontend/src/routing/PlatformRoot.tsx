import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useVaultBaseDomain } from '../hooks/useVaultBaseDomain';
import { classifyHostname, isBareLocalHost } from '../lib/hostname';
import { LoadingState } from '../components/ui/LoadingState';
import { LandingPage } from '../pages/marketing/LandingPage';
import { TenantWelcomePage } from '../pages/tenant/TenantWelcomePage';
import { UnavailableWorkspacePage } from '../pages/UnavailableWorkspacePage';

export function PlatformRoot() {
  const { me, loading } = useAuth();
  const { baseDomain, loading: configLoading } = useVaultBaseDomain();

  if (loading || configLoading) {
    return <LoadingState label="Loading…" />;
  }

  const host = window.location.hostname;
  const ctx = classifyHostname(host, baseDomain);

  if (ctx === 'invalid') {
    return <UnavailableWorkspacePage />;
  }

  if (ctx === 'local' && isBareLocalHost(host)) {
    if (me?.session.scope === 'platform') return <Navigate to="/platform" replace />;
    if (me) return <Navigate to="/tenant" replace />;
    return <LandingPage />;
  }

  if (ctx === 'platform') {
    if (me?.session.scope === 'platform') return <Navigate to="/platform" replace />;
    if (me) return <Navigate to="/tenant" replace />;
    return <LandingPage />;
  }

  if (!me) return <TenantWelcomePage />;
  return <Navigate to="/tenant" replace />;
}
