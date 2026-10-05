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
import { AppShell } from './layout/AppShell';

function Protected({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <p className="muted">Loading session…</p>;
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/tenant" replace />} />
        <Route path="platform" element={<PlatformPage />} />
        <Route path="platform/tenants/:id" element={<PlatformTenantDetailPage />} />
        <Route path="tenant" element={<TenantPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="access-requests" element={<ApplicationAccessPage />} />
        <Route path="personal-vault" element={<PersonalVaultPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="applications/:applicationId" element={<ApplicationDetailPage />} />
        <Route path="applications/:applicationId/vault" element={<ApplicationVaultPage />} />
        <Route path="applications/:applicationId/access" element={<ApplicationAccessPage />} />
      </Route>
      <Route path="*" element={<p>Not found</p>} />
    </Routes>
  );
}
