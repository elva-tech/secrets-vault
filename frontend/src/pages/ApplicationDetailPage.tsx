import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { useToast } from '../notifications/ToastContext';
import { apiErrorMessage } from '../lib/validation';

type Member = { userId: string; displayName: string; email: string; role: string };
type Environment = { id: string; name: string; slug: string; description: string; status: string };
type Application = {
  id: string;
  name: string;
  slug: string;
  description: string;
  owner: { id: string; displayName: string } | null;
  managers: Member[];
  metadata: Array<{ label: string; value: string; visibility: string }>;
  members?: Member[];
};

type TenantUser = { id: string; displayName: string; email: string };

export function ApplicationDetailPage() {
  const { applicationId } = useParams();
  const { me } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<'overview' | 'members' | 'environments' | 'vault' | 'access' | 'audit'>('overview');
  const [application, setApplication] = useState<Application | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [envName, setEnvName] = useState('');
  const [envSlug, setEnvSlug] = useState('');
  const [envDescription, setEnvDescription] = useState('');
  const [editEnv, setEditEnv] = useState<Environment | null>(null);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [deleteEnvId, setDeleteEnvId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const canEditApp = me?.permissions?.includes('application.edit');
  const canCreateEnv = me?.permissions?.includes('environment.create');
  const canEditEnv = me?.permissions?.includes('environment.edit');
  const canDeleteEnv = me?.permissions?.includes('environment.delete');

  async function load() {
    if (!applicationId) return;
    const appRes = await apiFetch<{ application: Application }>(
      `/api/applications/${applicationId}`,
    );
    setApplication(appRes.application);
    const envRes = await apiFetch<{ environments: Environment[] }>(
      `/api/applications/${applicationId}/environments`,
    );
    setEnvironments(envRes.environments);
    if (me?.permissions?.includes('user.view')) {
      try {
        const usersRes = await apiFetch<{ users: TenantUser[] }>('/api/tenant/users');
        setTenantUsers(usersRes.users.map((u) => ({ id: u.id, displayName: u.displayName, email: u.email })));
      } catch {
        /* optional */
      }
    }
  }

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load application');
    });
  }, [applicationId, me?.permissions]);

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!applicationId || !memberUserId) return;
    setError(null);
    try {
      await apiFetch(`/api/applications/${applicationId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: memberUserId }),
      });
      setMemberUserId('');
      push('success', 'Member added');
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to add member'));
    }
  }

  async function confirmRemoveMember() {
    if (!applicationId || !removeMemberId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/applications/${applicationId}/members/${removeMemberId}`, {
        method: 'DELETE',
      });
      push('success', 'Member removed');
      setRemoveMemberId(null);
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to remove member'));
    } finally {
      setActionLoading(false);
    }
  }

  async function addEnvironment(e: FormEvent) {
    e.preventDefault();
    if (!applicationId) return;
    setError(null);
    try {
      await apiFetch(`/api/applications/${applicationId}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name: envName, slug: envSlug, description: envDescription || undefined }),
      });
      setEnvName('');
      setEnvSlug('');
      setEnvDescription('');
      push('success', 'Environment created');
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to create environment'));
    }
  }

  async function saveEnvironment(e: FormEvent) {
    e.preventDefault();
    if (!editEnv) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/environments/${editEnv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editEnv.name,
          description: editEnv.description,
        }),
      });
      push('success', 'Environment updated');
      setEditEnv(null);
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to update environment'));
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDeleteEnv() {
    if (!deleteEnvId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/environments/${deleteEnvId}`, { method: 'DELETE' });
      push('success', 'Environment deleted');
      setDeleteEnvId(null);
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to delete environment'));
    } finally {
      setActionLoading(false);
    }
  }

  if (!application) {
    return <p className="muted">Loading application…</p>;
  }

  return (
    <div>
      <p><Link to="/applications">← Applications</Link></p>
      <div className="card">
        <h1>{application.name}</h1>
        <p className="muted">{application.description}</p>
        <nav className="tab-nav">
          {(['overview', 'members', 'environments', 'vault', 'access', 'audit'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? '' : 'secondary'}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        {error && <div className="error-banner">{error}</div>}

        {tab === 'overview' && (
          <div>
            <p><strong>Owner:</strong> {application.owner?.displayName ?? '—'}</p>
            <p><strong>Managers:</strong> {application.managers.map((m) => m.displayName).join(', ') || '—'}</p>
            <h3>Metadata</h3>
            {application.metadata.length === 0 ? (
              <p className="muted">No metadata.</p>
            ) : (
              <ul>
                {application.metadata.map((m) => (
                  <li key={m.label}>{m.label}: {m.value} <span className="muted">({m.visibility})</span></li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'members' && (
          <div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    {canEditApp && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(application.members ?? []).map((m) => (
                    <tr key={m.userId}>
                      <td>{m.displayName}</td>
                      <td>{m.email}</td>
                      <td>{m.role}</td>
                      {canEditApp && (
                        <td>
                          <button
                            type="button"
                            className="danger-text"
                            onClick={() => setRemoveMemberId(m.userId)}
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEditApp && (
              <form className="form" onSubmit={(e) => void addMember(e)}>
                <label>
                  Add member
                  <select
                    value={memberUserId}
                    onChange={(e) => setMemberUserId(e.target.value)}
                    required
                  >
                    <option value="">Select user…</option>
                    {tenantUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} ({u.email})
                      </option>
                    ))}
                  </select>
                </label>
                {tenantUsers.length === 0 && (
                  <p className="muted small-note">User list requires user.view permission.</p>
                )}
                <button type="submit">Add member</button>
              </form>
            )}
          </div>
        )}

        {tab === 'vault' && (
          <p>
            <Link to={`/applications/${applicationId}/vault`}>Open environment vault →</Link>
          </p>
        )}

        {tab === 'access' && (
          <p>
            <Link to={`/applications/${applicationId}/access`}>Open access requests →</Link>
          </p>
        )}

        {tab === 'audit' && (
          <p>
            <Link to="/audit">Open tenant audit logs →</Link>
          </p>
        )}

        {tab === 'environments' && (
          <div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Status</th>
                    {(canEditEnv || canDeleteEnv) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {environments.map((e) => (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td>{e.slug}</td>
                      <td>{e.status}</td>
                      {(canEditEnv || canDeleteEnv) && (
                        <td className="action-row">
                          {canEditEnv && (
                            <button type="button" className="secondary" onClick={() => setEditEnv(e)}>
                              Edit
                            </button>
                          )}
                          {canDeleteEnv && (
                            <button type="button" className="danger-text" onClick={() => setDeleteEnvId(e.id)}>
                              Delete
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canCreateEnv && (
              <form className="form" onSubmit={(e) => void addEnvironment(e)}>
                <label>Name<input value={envName} onChange={(ev) => setEnvName(ev.target.value)} required /></label>
                <label>Slug<input value={envSlug} onChange={(ev) => setEnvSlug(ev.target.value)} required /></label>
                <label>Description<input value={envDescription} onChange={(ev) => setEnvDescription(ev.target.value)} /></label>
                <button type="submit">Create environment</button>
              </form>
            )}
          </div>
        )}
      </div>

      <Modal title="Edit environment" open={!!editEnv} onClose={() => setEditEnv(null)}>
        {editEnv && (
          <form className="form" onSubmit={(e) => void saveEnvironment(e)}>
            <label>
              Name
              <input
                value={editEnv.name}
                onChange={(e) => setEditEnv({ ...editEnv, name: e.target.value })}
                required
              />
            </label>
            <label>
              Description
              <input
                value={editEnv.description}
                onChange={(e) => setEditEnv({ ...editEnv, description: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditEnv(null)}>Cancel</button>
              <button type="submit" disabled={actionLoading}>{actionLoading ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removeMemberId}
        title="Remove member"
        message="Are you sure you want to remove this member from the application?"
        confirmLabel="Remove"
        destructive
        loading={actionLoading}
        onCancel={() => setRemoveMemberId(null)}
        onConfirm={() => void confirmRemoveMember()}
      />

      <ConfirmDialog
        open={!!deleteEnvId}
        title="Delete environment"
        message="Are you sure you want to delete this environment? Vault data in this environment may be affected."
        confirmLabel="Delete"
        destructive
        loading={actionLoading}
        onCancel={() => setDeleteEnvId(null)}
        onConfirm={() => void confirmDeleteEnv()}
      />
    </div>
  );
}
