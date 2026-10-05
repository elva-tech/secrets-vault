import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { useToast } from '../notifications/ToastContext';
import {
  TENANT_PERMISSION_GROUPS,
  permissionLabel,
} from '../lib/permissionGroups';
import {
  apiErrorMessage,
  validateEmail,
  validatePassword,
} from '../lib/validation';

type TenantContext = {
  tenant: {
    tenantId: string;
    slug: string;
    name: string;
    status: string;
    primaryDomain?: string;
  };
};

type RoleRow = {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  builtInKey?: string;
  permissionKeys: string[];
  description?: string;
};

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  membership: { status: string; roleIds: string[]; joinedAt?: string };
};

type SettingsTab = 'tenant' | 'users' | 'roles';

export function TenantPage() {
  const { me } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<SettingsTab>('tenant');
  const [context, setContext] = useState<TenantContext | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [userFieldErrors, setUserFieldErrors] = useState<Record<string, string>>({});
  const [userForm, setUserForm] = useState({
    displayName: '',
    email: '',
    password: '',
    passwordConfirm: '',
    roleIds: [] as string[],
  });

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [roleFieldErrors, setRoleFieldErrors] = useState<Record<string, string>>({});
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissionKeys: [] as string[],
  });

  const canViewUsers = me?.permissions?.includes('user.view');
  const canCreateUsers = me?.permissions?.includes('user.create');
  const canViewRoles = me?.permissions?.includes('role.view');
  const canCreateRoles = me?.permissions?.includes('role.create');

  if (me?.session.scope !== 'tenant') {
    return <Navigate to="/forbidden" replace />;
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx = await apiFetch<TenantContext>('/api/tenant/context');
      setContext(ctx);
      if (canViewRoles) {
        const roleData = await apiFetch<{ roles: RoleRow[] }>('/api/tenant/roles');
        setRoles(roleData.roles);
      }
      if (canViewUsers) {
        const userData = await apiFetch<{ users: UserRow[] }>('/api/tenant/users');
        setUsers(userData.users);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load tenant settings'));
    } finally {
      setLoading(false);
    }
  }, [canViewRoles, canViewUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  function roleNameById(id: string): string {
    return roles.find((r) => r.id === id)?.name ?? id.slice(-6);
  }

  function validateUserForm(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!userForm.displayName.trim()) errs.displayName = 'Display name is required';
    const emailErr = validateEmail(userForm.email);
    if (emailErr) errs.email = emailErr;
    const pwErr = validatePassword(userForm.password);
    if (pwErr) errs.password = pwErr;
    if (userForm.password !== userForm.passwordConfirm) errs.passwordConfirm = 'Passwords do not match';
    if (userForm.roleIds.length === 0) errs.roleIds = 'Select at least one role';
    return errs;
  }

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    const errs = validateUserForm();
    setUserFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setUserSubmitting(true);
    try {
      await apiFetch('/api/tenant/users', {
        method: 'POST',
        body: JSON.stringify({
          displayName: userForm.displayName.trim(),
          email: userForm.email.trim().toLowerCase(),
          password: userForm.password,
          roleIds: userForm.roleIds,
        }),
      });
      push('success', 'User created');
      setUserModalOpen(false);
      setUserForm({
        displayName: '',
        email: '',
        password: '',
        passwordConfirm: '',
        roleIds: [],
      });
      await load();
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'MEMBERSHIP_EXISTS') {
        setUserFieldErrors({ email: 'This user is already a member of this tenant' });
      } else if (e.code === 'INVALID_ROLES') {
        setUserFieldErrors({ roleIds: e.message });
      } else {
        push('error', apiErrorMessage(err, 'Failed to create user'));
      }
    } finally {
      setUserSubmitting(false);
    }
  }

  function toggleRolePermission(key: string) {
    setRoleForm((f) => ({
      ...f,
      permissionKeys: f.permissionKeys.includes(key)
        ? f.permissionKeys.filter((k) => k !== key)
        : [...f.permissionKeys, key],
    }));
  }

  async function onCreateRole(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!roleForm.name.trim()) errs.name = 'Role name is required';
    if (roleForm.permissionKeys.length === 0) errs.permissionKeys = 'Select at least one permission';
    setRoleFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setRoleSubmitting(true);
    try {
      await apiFetch('/api/tenant/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: roleForm.name.trim(),
          description: roleForm.description.trim() || undefined,
          permissionKeys: roleForm.permissionKeys,
        }),
      });
      push('success', 'Role created');
      setRoleModalOpen(false);
      setRoleForm({ name: '', description: '', permissionKeys: [] });
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to create role'));
    } finally {
      setRoleSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h1>Settings</h1>
      <p className="muted">Tenant administration — users and roles.</p>
      {error && <div className="error-banner">{error}</div>}

      <nav className="tab-nav">
        {(['tenant', 'users', 'roles'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? '' : 'secondary'}
            onClick={() => setTab(t)}
          >
            {t === 'tenant' ? 'Tenant' : t === 'users' ? 'Users' : 'Roles'}
          </button>
        ))}
      </nav>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {tab === 'tenant' && context && (
            <dl className="detail-grid">
              <dt>Name</dt>
              <dd>{context.tenant.name}</dd>
              <dt>Slug</dt>
              <dd>{context.tenant.slug}</dd>
              <dt>Status</dt>
              <dd>{context.tenant.status}</dd>
              <dt>Domain</dt>
              <dd className="mono">{context.tenant.primaryDomain ?? '—'}</dd>
            </dl>
          )}

          {tab === 'users' && (
            <div>
              {!canViewUsers ? (
                <p className="muted">You do not have permission to view users.</p>
              ) : (
                <>
                  <div className="page-header">
                    <h2>Users</h2>
                    {canCreateUsers && (
                      <button type="button" onClick={() => setUserModalOpen(true)}>Create user</button>
                    )}
                  </div>
                  {users.length === 0 ? (
                    <p className="muted">No users in this tenant yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Roles</th>
                            <th>Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((u) => (
                            <tr key={u.id}>
                              <td>{u.displayName}</td>
                              <td>{u.email}</td>
                              <td>{u.status}</td>
                              <td>{u.membership.roleIds.map((id) => roleNameById(id)).join(', ')}</td>
                              <td>
                                {u.membership.joinedAt
                                  ? new Date(u.membership.joinedAt).toLocaleDateString()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="muted small-note">
                    Editing, disabling, or deleting users is not available in the current API.
                  </p>
                </>
              )}
            </div>
          )}

          {tab === 'roles' && (
            <div>
              {!canViewRoles ? (
                <p className="muted">You do not have permission to view roles.</p>
              ) : (
                <>
                  <div className="page-header">
                    <h2>Roles</h2>
                    {canCreateRoles && (
                      <button type="button" onClick={() => setRoleModalOpen(true)}>Create role</button>
                    )}
                  </div>
                  {roles.length === 0 ? (
                    <p className="muted">No roles found.</p>
                  ) : (
                    <div className="role-list">
                      {roles.map((r) => (
                        <div key={r.id} className="card nested-card">
                          <div className="page-header">
                            <strong>{r.name}</strong>
                            {r.isBuiltIn && (
                              <span className="status-pill">Built-in{r.builtInKey ? `: ${r.builtInKey}` : ''}</span>
                            )}
                          </div>
                          {r.description && <p className="muted">{r.description}</p>}
                          <p className="muted">{r.permissionKeys.length} permissions</p>
                          <details>
                            <summary>View permissions</summary>
                            <ul className="perm-list">
                              {r.permissionKeys.map((k) => (
                                <li key={k}>{permissionLabel(k)}</li>
                              ))}
                            </ul>
                          </details>
                          {r.isBuiltIn && (
                            <p className="muted small-note">Built-in roles cannot be modified through the UI.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="muted small-note">
                    Editing or deleting custom roles is not available in the current API.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}

      <Modal title="Create user" open={userModalOpen} onClose={() => setUserModalOpen(false)} wide>
        <form className="form form-wide" onSubmit={(e) => void onCreateUser(e)}>
          <label>
            Display name
            <input
              value={userForm.displayName}
              onChange={(e) => setUserForm((f) => ({ ...f, displayName: e.target.value }))}
            />
            {userFieldErrors.displayName && <span className="field-error">{userFieldErrors.displayName}</span>}
          </label>
          <label>
            Email
            <input
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="off"
            />
            {userFieldErrors.email && <span className="field-error">{userFieldErrors.email}</span>}
          </label>
          <label>
            Password
            <input
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
            {userFieldErrors.password && <span className="field-error">{userFieldErrors.password}</span>}
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={userForm.passwordConfirm}
              onChange={(e) => setUserForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
              autoComplete="new-password"
            />
            {userFieldErrors.passwordConfirm && (
              <span className="field-error">{userFieldErrors.passwordConfirm}</span>
            )}
          </label>
          <fieldset>
            <legend>Roles</legend>
            {roles.map((r) => (
              <label key={r.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={userForm.roleIds.includes(r.id)}
                  onChange={() => {
                    setUserForm((f) => ({
                      ...f,
                      roleIds: f.roleIds.includes(r.id)
                        ? f.roleIds.filter((id) => id !== r.id)
                        : [...f.roleIds, r.id],
                    }));
                  }}
                />
                {r.name}
                {r.builtInKey ? ` (${r.builtInKey})` : ''}
              </label>
            ))}
            {userFieldErrors.roleIds && <span className="field-error">{userFieldErrors.roleIds}</span>}
          </fieldset>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setUserModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={userSubmitting}>{userSubmitting ? 'Saving…' : 'Create user'}</button>
          </div>
        </form>
      </Modal>

      <Modal title="Create role" open={roleModalOpen} onClose={() => setRoleModalOpen(false)} wide>
        <form className="form form-wide" onSubmit={(e) => void onCreateRole(e)}>
          <label>
            Role name
            <input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} />
            {roleFieldErrors.name && <span className="field-error">{roleFieldErrors.name}</span>}
          </label>
          <label>
            Description (optional)
            <input
              value={roleForm.description}
              onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <fieldset>
            <legend>Permissions</legend>
            {roleFieldErrors.permissionKeys && (
              <span className="field-error">{roleFieldErrors.permissionKeys}</span>
            )}
            {TENANT_PERMISSION_GROUPS.map((group) => (
              <div key={group.label} className="perm-group">
                <strong>{group.label}</strong>
                <div className="perm-checkboxes">
                  {group.permissions.map((p) => (
                    <label key={p.key} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={roleForm.permissionKeys.includes(p.key)}
                        onChange={() => toggleRolePermission(p.key)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setRoleModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={roleSubmitting}>{roleSubmitting ? 'Saving…' : 'Create role'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
