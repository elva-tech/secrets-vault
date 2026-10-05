import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../notifications/ToastContext';
import { apiErrorMessage } from '../lib/validation';

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  primaryDomain: string;
  plan?: string;
  createdAt?: string;
  updatedAt?: string;
};

type StatusAction = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export function PlatformTenantDetailPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const { push } = useToast();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<StatusAction | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  if (!me?.user.isPlatformSuperAdmin) {
    return <Navigate to="/forbidden" replace />;
  }

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ tenant: TenantDetail }>(`/api/platform/tenants/${id}`);
      setTenant(res.tenant);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load tenant'));
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: StatusAction) {
    if (!tenant) return;
    setStatusLoading(true);
    try {
      const res = await apiFetch<{ tenant: TenantDetail }>(`/api/platform/tenants/${tenant.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setTenant(res.tenant);
      push('success', `Tenant status updated to ${status}`);
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to update status'));
    } finally {
      setStatusLoading(false);
      setStatusConfirm(null);
    }
  }

  function onStatusClick(status: StatusAction) {
    if (status === 'ACTIVE') {
      void setStatus(status);
      return;
    }
    setStatusConfirm(status);
  }

  if (loading) return <p className="muted">Loading tenant…</p>;
  if (!tenant) {
    return (
      <div className="card">
        <p><Link to="/platform">← Tenants</Link></p>
        {error && <div className="error-banner">{error}</div>}
        <p>Tenant not found.</p>
      </div>
    );
  }

  return (
    <div>
      <p><Link to="/platform">← Tenants</Link></p>
      <div className="card">
        <div className="page-header">
          <h1>{tenant.name}</h1>
          <span className={`status-pill status-${tenant.status.toLowerCase()}`}>{tenant.status}</span>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <dl className="detail-grid">
          <dt>Slug</dt>
          <dd>{tenant.slug}</dd>
          <dt>Primary domain</dt>
          <dd className="mono">{tenant.primaryDomain}</dd>
          <dt>Plan</dt>
          <dd>{tenant.plan || '—'}</dd>
          <dt>Created</dt>
          <dd>{tenant.createdAt ? new Date(tenant.createdAt).toLocaleString() : '—'}</dd>
          <dt>Updated</dt>
          <dd>{tenant.updatedAt ? new Date(tenant.updatedAt).toLocaleString() : '—'}</dd>
        </dl>
        <p className="muted">
          Business Admin account details are not exposed by the platform API. Use the email provided at tenant
          creation.
        </p>
        <div className="action-row" style={{ marginTop: 16 }}>
          {tenant.status !== 'ACTIVE' && (
            <button type="button" onClick={() => onStatusClick('ACTIVE')}>Activate</button>
          )}
          {tenant.status !== 'SUSPENDED' && (
            <button type="button" className="secondary" onClick={() => onStatusClick('SUSPENDED')}>
              Suspend
            </button>
          )}
          {tenant.status !== 'DISABLED' && (
            <button type="button" className="secondary" onClick={() => onStatusClick('DISABLED')}>
              Disable
            </button>
          )}
        </div>
      </div>

      {statusConfirm === 'SUSPENDED' && (
        <ConfirmDialog
          open
          title="Suspend tenant"
          message="Are you sure you want to suspend this tenant?"
          confirmLabel="Suspend"
          destructive
          loading={statusLoading}
          onCancel={() => setStatusConfirm(null)}
          onConfirm={() => void setStatus('SUSPENDED')}
        />
      )}
      {statusConfirm === 'DISABLED' && (
        <ConfirmDialog
          open
          title="Disable tenant"
          message="Are you sure you want to disable this tenant?"
          confirmLabel="Disable"
          destructive
          loading={statusLoading}
          onCancel={() => setStatusConfirm(null)}
          onConfirm={() => void setStatus('DISABLED')}
        />
      )}
    </div>
  );
}
