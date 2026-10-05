import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../notifications/ToastContext';
import {
  apiErrorMessage,
  validateEmail,
  validatePassword,
  validateTenantSlug,
} from '../lib/validation';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  primaryDomain: string;
  plan?: string;
  createdAt?: string;
};

type StatusAction = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

const STATUS_CONFIRM: Record<Exclude<StatusAction, 'ACTIVE'>, { title: string; message: string }> = {
  SUSPENDED: {
    title: 'Suspend tenant',
    message: 'Are you sure you want to suspend this tenant? Users may lose access until the tenant is activated again.',
  },
  DISABLED: {
    title: 'Disable tenant',
    message: 'Are you sure you want to disable this tenant? This is a stronger restriction than suspend.',
  },
};

export function PlatformPage() {
  const { me } = useAuth();
  const { push } = useToast();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [lastCreated, setLastCreated] = useState<{ tenant: TenantRow; businessAdminEmail: string } | null>(
    null,
  );
  const [statusConfirm, setStatusConfirm] = useState<{ id: string; status: StatusAction } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    plan: '',
    adminDisplayName: '',
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
  });

  if (!me?.user.isPlatformSuperAdmin) {
    return <Navigate to="/forbidden" replace />;
  }

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ tenants: TenantRow[] }>('/api/platform/tenants');
      setTenants(data.tenants);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load tenants'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  async function applyStatus(id: string, status: StatusAction) {
    setStatusLoading(true);
    try {
      await apiFetch(`/api/platform/tenants/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      push('success', `Tenant status updated to ${status}`);
      await loadTenants();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to update tenant status'));
    } finally {
      setStatusLoading(false);
      setStatusConfirm(null);
    }
  }

  function requestStatus(id: string, status: StatusAction) {
    if (status === 'ACTIVE') {
      void applyStatus(id, status);
      return;
    }
    setStatusConfirm({ id, status });
  }

  function validateCreateForm(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Tenant name is required';
    const slugErr = validateTenantSlug(form.slug);
    if (slugErr) errs.slug = slugErr;
    if (!form.adminDisplayName.trim()) errs.adminDisplayName = 'Display name is required';
    const emailErr = validateEmail(form.adminEmail);
    if (emailErr) errs.adminEmail = emailErr;
    const pwErr = validatePassword(form.adminPassword);
    if (pwErr) errs.adminPassword = pwErr;
    if (form.adminPassword !== form.adminPasswordConfirm) {
      errs.adminPasswordConfirm = 'Passwords do not match';
    }
    return errs;
  }

  async function onCreateTenant(e: FormEvent) {
    e.preventDefault();
    const errs = validateCreateForm();
    setCreateErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setCreateLoading(true);
    setCreateErrors({});
    try {
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        plan: form.plan.trim() || undefined,
        businessAdmin: {
          email: form.adminEmail.trim().toLowerCase(),
          password: form.adminPassword,
          displayName: form.adminDisplayName.trim(),
        },
      };
      const res = await apiFetch<{ tenant: TenantRow }>('/api/platform/tenants', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setLastCreated({ tenant: res.tenant, businessAdminEmail: body.businessAdmin.email });
      push('success', 'Tenant created successfully');
      setCreateOpen(false);
      setForm({
        name: '',
        slug: '',
        plan: '',
        adminDisplayName: '',
        adminEmail: '',
        adminPassword: '',
        adminPasswordConfirm: '',
      });
      await loadTenants();
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'TENANT_SLUG_EXISTS') {
        setCreateErrors({ slug: 'This slug is already in use' });
      } else if (e.message.toLowerCase().includes('email')) {
        setCreateErrors({ adminEmail: e.message });
      } else {
        push('error', apiErrorMessage(err, 'Failed to create tenant'));
      }
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Platform — Tenants</h1>
          <p className="muted">Create and manage tenants (no access to customer secret values).</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)}>Create tenant</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {lastCreated && (
        <div className="success-banner">
          <strong>Tenant created:</strong> {lastCreated.tenant.name} ({lastCreated.tenant.slug}) — status{' '}
          {lastCreated.tenant.status} — domain {lastCreated.tenant.primaryDomain} — Business Admin{' '}
          {lastCreated.businessAdminEmail}
          {lastCreated.tenant.status === 'PENDING' && (
            <button
              type="button"
              className="inline-link-button"
              onClick={() => void requestStatus(lastCreated.tenant.id, 'ACTIVE')}
            >
              Activate now
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading tenants…</p>
      ) : tenants.length === 0 ? (
        <p className="muted">No tenants yet. Create your first tenant to get started.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Domain</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/platform/tenants/${t.id}`}>{t.name}</Link>
                  </td>
                  <td>{t.slug}</td>
                  <td><span className={`status-pill status-${t.status.toLowerCase()}`}>{t.status}</span></td>
                  <td className="mono">{t.primaryDomain}</td>
                  <td>
                    <div className="action-row">
                      {t.status !== 'ACTIVE' && (
                        <button type="button" onClick={() => void requestStatus(t.id, 'ACTIVE')}>
                          Activate
                        </button>
                      )}
                      {t.status !== 'SUSPENDED' && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void requestStatus(t.id, 'SUSPENDED')}
                        >
                          Suspend
                        </button>
                      )}
                      {t.status !== 'DISABLED' && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void requestStatus(t.id, 'DISABLED')}
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="Create tenant" open={createOpen} onClose={() => setCreateOpen(false)} wide>
        <form className="form form-wide" onSubmit={(e) => void onCreateTenant(e)}>
          <h3>Tenant information</h3>
          <label>
            Tenant name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {createErrors.name && <span className="field-error">{createErrors.name}</span>}
          </label>
          <label>
            Tenant slug
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
              required
              placeholder="acme-corp"
            />
            {createErrors.slug && <span className="field-error">{createErrors.slug}</span>}
          </label>
          <label>
            Plan (optional)
            <input value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} />
          </label>

          <h3>Business administrator</h3>
          <label>
            Display name
            <input
              value={form.adminDisplayName}
              onChange={(e) => setForm((f) => ({ ...f, adminDisplayName: e.target.value }))}
              required
            />
            {createErrors.adminDisplayName && (
              <span className="field-error">{createErrors.adminDisplayName}</span>
            )}
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
              required
              autoComplete="off"
            />
            {createErrors.adminEmail && <span className="field-error">{createErrors.adminEmail}</span>}
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.adminPassword}
              onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
              required
              autoComplete="new-password"
            />
            {createErrors.adminPassword && <span className="field-error">{createErrors.adminPassword}</span>}
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={form.adminPasswordConfirm}
              onChange={(e) => setForm((f) => ({ ...f, adminPasswordConfirm: e.target.value }))}
              required
              autoComplete="new-password"
            />
            {createErrors.adminPasswordConfirm && (
              <span className="field-error">{createErrors.adminPasswordConfirm}</span>
            )}
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={createLoading}>
              {createLoading ? 'Creating…' : 'Create tenant'}
            </button>
          </div>
        </form>
      </Modal>

      {statusConfirm && statusConfirm.status !== 'ACTIVE' && (
        <ConfirmDialog
          open
          title={STATUS_CONFIRM[statusConfirm.status].title}
          message={STATUS_CONFIRM[statusConfirm.status].message}
          confirmLabel={statusConfirm.status === 'SUSPENDED' ? 'Suspend' : 'Disable'}
          destructive
          loading={statusLoading}
          onCancel={() => setStatusConfirm(null)}
          onConfirm={() => void applyStatus(statusConfirm.id, statusConfirm.status)}
        />
      )}
    </div>
  );
}
