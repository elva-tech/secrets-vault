import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { PlatformPage } from './pages/PlatformPage';
import { PlatformTenantDetailPage } from './pages/PlatformTenantDetailPage';
import { TenantPage } from './pages/TenantPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { ApplicationDetailPage } from './pages/ApplicationDetailPage';
import { ApplicationVaultPage } from './pages/ApplicationVaultPage';
import { ApplicationAccessPage } from './pages/ApplicationAccessPage';
import { PersonalVaultPage } from './pages/PersonalVaultPage';
import { AuditPage } from './pages/AuditPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { PlatformShell } from './layout/PlatformShell';
import { TenantShell } from './layout/TenantShell';
import { PlatformRoot } from './routing/PlatformRoot';
import { CollaboratePage } from './pages/marketing/CollaboratePage';
import { UnavailableWorkspacePage } from './pages/UnavailableWorkspacePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoadingState } from './components/ui/LoadingState';

function Protected({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <LoadingState label="Loading session…" />;
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PlatformProtected({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <LoadingState label="Loading session…" />;
  if (!me?.user.isPlatformSuperAdmin || me.session.scope !== 'platform') {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}

/** Tenant APIs require a tenant hostname session — not platform super-admin on the platform host. */
function TenantArea({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  if (me?.session.scope === 'platform') {
    return <Navigate to="/platform" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PlatformRoot />} />
      <Route path="/collaborate" element={<CollaboratePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="/unavailable" element={<UnavailableWorkspacePage />} />

      <Route
        path="/platform"
        element={
          <Protected>
            <PlatformProtected>
              <PlatformShell />
            </PlatformProtected>
          </Protected>
        }
      >
        <Route index element={<PlatformPage />} />
        <Route path="tenants/:id" element={<PlatformTenantDetailPage />} />
      </Route>

      <Route
        element={
          <Protected>
            <TenantShell />
          </Protected>
        }
      >
        <Route path="tenant" element={<TenantArea><TenantPage /></TenantArea>} />
        <Route path="applications" element={<TenantArea><ApplicationsPage /></TenantArea>} />
        <Route path="access-requests" element={<TenantArea><ApplicationAccessPage /></TenantArea>} />
        <Route path="personal-vault" element={<TenantArea><PersonalVaultPage /></TenantArea>} />
        <Route path="audit" element={<TenantArea><AuditPage /></TenantArea>} />
        <Route path="applications/:applicationId" element={<TenantArea><ApplicationDetailPage /></TenantArea>} />
        <Route path="applications/:applicationId/vault" element={<TenantArea><ApplicationVaultPage /></TenantArea>} />
        <Route path="applications/:applicationId/access" element={<TenantArea><ApplicationAccessPage /></TenantArea>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
