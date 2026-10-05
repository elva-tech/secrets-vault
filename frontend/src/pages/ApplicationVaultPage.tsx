import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, apiRequestHeaders, apiUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { useToast } from '../notifications/ToastContext';
import { apiErrorMessage } from '../lib/validation';

type Environment = { id: string; name: string; slug: string };
type SecretRow = { id: string; name: string; type: string; masked: boolean; currentVersionNumber: number };
type FileRow = { id: string; name: string; size: number; masked: boolean };
type SecretDetail = SecretRow & { description?: string };

type RotationMeta = {
  rotationEnabled?: boolean;
  rotationType?: string;
  rotationMode?: string;
  rotationStatus?: string;
  lastRotatedAt?: string;
  nextRotationAt?: string;
  customRotationDate?: string;
};

const ROTATION_OPTIONS = [
  { value: 'NO_EXPIRY', label: 'No expiry' },
  { value: 'MONTHS_3', label: '3 months' },
  { value: 'MONTHS_6', label: '6 months' },
  { value: 'MONTHS_9', label: '9 months' },
  { value: 'MONTHS_12', label: '12 months' },
  { value: 'CUSTOM_DATE', label: 'Custom date' },
] as const;

export function ApplicationVaultPage() {
  const { applicationId } = useParams();
  const { me } = useAuth();
  const { push } = useToast();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [envId, setEnvId] = useState('');
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [selected, setSelected] = useState<SecretDetail | null>(null);
  const [rotation, setRotation] = useState<RotationMeta | null>(null);
  const [rotationType, setRotationType] = useState('NO_EXPIRY');
  const [customDate, setCustomDate] = useState('');
  const [rotationSaving, setRotationSaving] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [versions, setVersions] = useState<Array<{ versionNumber: number; isCurrent: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [accessReason, setAccessReason] = useState('');
  const [policyNonOwner, setPolicyNonOwner] = useState('APPROVAL_REQUIRED');
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [secretType, setSecretType] = useState('PASSWORD');
  const [rotateValue, setRotateValue] = useState('');
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [deleteSecretOpen, setDeleteSecretOpen] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canRotate = me?.permissions?.includes('secret.rotate');
  const canEditSecret = me?.permissions?.includes('secret.edit');
  const canDeleteSecret = me?.permissions?.includes('secret.delete');
  const canDeleteFile = me?.permissions?.includes('file.delete');

  useEffect(() => {
    if (!applicationId) return;
    void apiFetch<{ environments: Environment[] }>(
      `/api/applications/${applicationId}/environments`,
    ).then((res) => {
      setEnvironments(res.environments);
      if (res.environments[0]) setEnvId(res.environments[0].id);
    });
  }, [applicationId]);

  useEffect(() => {
    if (!applicationId || !envId) return;
    void loadVault();
  }, [applicationId, envId]);

  async function loadVault() {
    const s = await apiFetch<{ secrets: SecretRow[] }>(
      `/api/vault/applications/${applicationId}/environments/${envId}/secrets`,
    );
    setSecrets(s.secrets);
    const f = await apiFetch<{ files: FileRow[] }>(
      `/api/vault/applications/${applicationId}/environments/${envId}/files`,
    );
    setFiles(f.files);
  }

  async function openSecret(id: string) {
    setRevealed(null);
    setApprovalRequired(false);
    setRotation(null);
    const res = await apiFetch<{ secret: SecretDetail & { rotation?: RotationMeta } }>(
      `/api/vault/secrets/${id}`,
    );
    setSelected(res.secret);
    const rot = res.secret.rotation;
    if (rot) {
      setRotation(rot);
      setRotationType(rot.rotationType ?? 'NO_EXPIRY');
      if (rot.customRotationDate) {
        setCustomDate(rot.customRotationDate.slice(0, 10));
      }
    } else {
      setRotationType('NO_EXPIRY');
      setCustomDate('');
    }
    try {
      const pol = await apiFetch<{ policy: { nonOwnerBehavior?: string } }>(
        `/api/policies/SECRET/${id}`,
      );
      if (pol.policy?.nonOwnerBehavior) setPolicyNonOwner(pol.policy.nonOwnerBehavior);
    } catch {
      /* policy view may be restricted */
    }
    const v = await apiFetch<{ versions: Array<{ versionNumber: number; isCurrent: boolean }> }>(
      `/api/vault/secrets/${id}/versions`,
    );
    setVersions(v.versions);
  }

  async function createSecret(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const value =
        secretType === 'PASSWORD'
          ? { username: '', password: secretValue }
          : secretType === 'KEY_VALUE'
            ? { key: secretName, value: secretValue }
            : { value: secretValue };
      await apiFetch(`/api/vault/applications/${applicationId}/environments/${envId}/secrets`, {
        method: 'POST',
        body: JSON.stringify({
          name: secretName,
          type: secretType,
          value,
        }),
      });
      setSecretName('');
      setSecretValue('');
      push('success', 'Secret created');
      await loadVault();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create secret'));
    }
  }

  async function revealSecret() {
    if (!selected) return;
    setApprovalRequired(false);
    setError(null);
    try {
      const res = await apiFetch<{ value: { password?: string; value?: string; key?: string } }>(
        `/api/vault/secrets/${selected.id}/reveal`,
        { method: 'POST' },
      );
      setRevealed(res.value.password ?? res.value.value ?? JSON.stringify(res.value));
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'APPROVAL_REQUIRED') {
        setApprovalRequired(true);
        return;
      }
      setError(e.message);
    }
  }

  async function requestAccess(e: FormEvent) {
    e.preventDefault();
    if (!selected || !applicationId || !envId) return;
    try {
      await apiFetch('/api/access-requests', {
        method: 'POST',
        body: JSON.stringify({
          applicationId,
          environmentId: envId,
          resourceType: 'SECRET',
          resourceIds: [selected.id],
          permissions: ['secret.reveal'],
          reason: accessReason,
        }),
      });
      setAccessReason('');
      setApprovalRequired(false);
      push('success', 'Access request submitted. Check Access Requests after owner approval.');
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to submit request'));
    }
  }

  async function savePolicy() {
    if (!selected) return;
    try {
      await apiFetch(`/api/policies/SECRET/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nonOwnerBehavior: policyNonOwner }),
      });
      push('success', 'Policy updated');
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to update policy'));
    }
  }

  async function saveRotation() {
    if (!selected) return;
    setRotationSaving(true);
    try {
      const body: { rotationType: string; customRotationDate?: string } = {
        rotationType,
      };
      if (rotationType === 'CUSTOM_DATE') {
        const d = new Date(`${customDate}T12:00:00.000Z`);
        if (d.getTime() <= Date.now()) {
          push('error', 'Custom rotation date must be in the future');
          setRotationSaving(false);
          return;
        }
        body.customRotationDate = d.toISOString();
      }
      const res = await apiFetch<{ rotation: RotationMeta }>(
        `/api/vault/secrets/${selected.id}/rotation`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      setRotation(res.rotation);
      push('success', 'Rotation settings saved');
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to save rotation settings'));
    } finally {
      setRotationSaving(false);
    }
  }

  function buildRotateValue() {
    if (!selected) return null;
    if (selected.type === 'PASSWORD') return { username: '', password: rotateValue };
    if (selected.type === 'KEY_VALUE') return { key: selected.name, value: rotateValue };
    return { value: rotateValue };
  }

  async function confirmRotate() {
    if (!selected) return;
    const value = buildRotateValue();
    if (!value || !rotateValue) {
      push('error', 'Enter the new secret value to rotate');
      return;
    }
    setRotateLoading(true);
    try {
      await apiFetch(`/api/vault/secrets/${selected.id}/rotate`, {
        method: 'POST',
        body: JSON.stringify({ value }),
      });
      push('success', 'Secret rotated successfully');
      setRotateOpen(false);
      setRotateValue('');
      await openSecret(selected.id);
      await loadVault();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Rotation failed'));
    } finally {
      setRotateLoading(false);
    }
  }

  async function confirmDeleteSecret() {
    if (!selected) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/vault/secrets/${selected.id}`, { method: 'DELETE' });
      push('success', 'Secret deleted');
      setSelected(null);
      setDeleteSecretOpen(false);
      await loadVault();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to delete secret'));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDeleteFile() {
    if (!deleteFileId) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/vault/files/${deleteFileId}`, { method: 'DELETE' });
      push('success', 'File deleted');
      setDeleteFileId(null);
      await loadVault();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to delete file'));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function uploadFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    if (!fileInput.files?.[0]) return;
    const data = new FormData();
    data.append('file', fileInput.files[0]);
    data.append('name', fileInput.files[0].name);
    const res = await fetch(apiUrl(`/api/vault/applications/${applicationId}/environments/${envId}/files`), {
      method: 'POST',
      credentials: 'include',
      headers: apiRequestHeaders(undefined, true),
      body: data,
    });
    if (!res.ok) {
      push('error', 'File upload failed');
      return;
    }
    push('success', 'File uploaded');
    await loadVault();
    form.reset();
  }

  function formatDate(iso?: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  return (
    <div>
      <p><Link to={`/applications/${applicationId}`}>← Application</Link></p>
      <div className="card">
        <h1>Vault</h1>
        {error && <div className="error-banner">{error}</div>}
        <label>
          Environment
          <select value={envId} onChange={(e) => setEnvId(e.target.value)}>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>{env.name}</option>
            ))}
          </select>
        </label>

        <h2>Secrets</h2>
        {secrets.length === 0 ? <p className="muted">No secrets in this environment.</p> : (
          <ul className="item-list">
            {secrets.map((s) => (
              <li key={s.id}>
                <button type="button" className="secondary" onClick={() => void openSecret(s.id)}>
                  {s.name} ({s.type}) v{s.currentVersionNumber}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="form" onSubmit={(e) => void createSecret(e)}>
          <h3>Create secret</h3>
          <label>Type
            <select value={secretType} onChange={(e) => setSecretType(e.target.value)}>
              <option value="PASSWORD">PASSWORD</option>
              <option value="KEY_VALUE">KEY_VALUE</option>
              <option value="TEXT">TEXT</option>
              <option value="API_KEY">API_KEY</option>
              <option value="TOKEN">TOKEN</option>
              <option value="CERTIFICATE">CERTIFICATE</option>
            </select>
          </label>
          <label>Name<input value={secretName} onChange={(e) => setSecretName(e.target.value)} required /></label>
          <label>Value<input type="password" value={secretValue} onChange={(e) => setSecretValue(e.target.value)} required /></label>
          <button type="submit">Create secret</button>
        </form>

        {selected && (
          <div className="card nested-card">
            <h3>{selected.name}</h3>
            <p className="muted">Type: {selected.type} — masked by default</p>
            <p>••••••••••••••••</p>
            <div className="action-row">
              <button type="button" onClick={() => void revealSecret()}>Reveal</button>
              {canDeleteSecret && (
                <button type="button" className="danger" onClick={() => setDeleteSecretOpen(true)}>
                  Delete
                </button>
              )}
            </div>
            {approvalRequired && (
              <div className="card nested-card">
                <h4>Access required</h4>
                <p>Resource: <strong>{selected.name}</strong></p>
                <form className="form" onSubmit={(e) => void requestAccess(e)}>
                  <label>
                    Reason
                    <textarea
                      value={accessReason}
                      onChange={(ev) => setAccessReason(ev.target.value)}
                      required
                      minLength={3}
                    />
                  </label>
                  <button type="submit">Request access</button>
                </form>
              </div>
            )}
            {revealed && <pre className="reveal-box">{revealed}</pre>}

            <div className="section-block">
              <h4>Resource policy</h4>
              <label>
                Non-owner behavior
                <select value={policyNonOwner} onChange={(e) => setPolicyNonOwner(e.target.value)}>
                  <option value="DENY">DENY</option>
                  <option value="ALLOW">ALLOW</option>
                  <option value="APPROVAL_REQUIRED">APPROVAL_REQUIRED</option>
                </select>
              </label>
              <button type="button" className="secondary" onClick={() => void savePolicy()}>
                Save policy
              </button>
            </div>

            {(canEditSecret || canRotate) && (
              <div className="section-block">
                <h4>Rotation settings</h4>
                {!rotation && (
                  <p className="muted small-note">
                    Current schedule is shown after you save rotation settings (GET secret metadata does not include
                    rotation fields).
                  </p>
                )}
                {rotation && (
                  <dl className="detail-grid compact">
                    <dt>Status</dt>
                    <dd>{rotation.rotationStatus ?? '—'}</dd>
                    <dt>Mode</dt>
                    <dd>{rotation.rotationMode ?? 'MANUAL'}</dd>
                    <dt>Last rotated</dt>
                    <dd>{formatDate(rotation.lastRotatedAt)}</dd>
                    <dt>Next rotation</dt>
                    <dd>{formatDate(rotation.nextRotationAt)}</dd>
                  </dl>
                )}
                {canEditSecret && (
                  <>
                    <label>
                      Schedule
                      <select
                        value={rotationType}
                        onChange={(e) => setRotationType(e.target.value)}
                        disabled={!canEditSecret}
                      >
                        {ROTATION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                    {rotationType === 'CUSTOM_DATE' && (
                      <label>
                        Custom date
                        <input
                          type="date"
                          value={customDate}
                          onChange={(e) => setCustomDate(e.target.value)}
                          required
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void saveRotation()}
                      disabled={rotationSaving}
                    >
                      {rotationSaving ? 'Saving…' : 'Save rotation settings'}
                    </button>
                  </>
                )}
                {canRotate && (
                  <button type="button" onClick={() => setRotateOpen(true)} style={{ marginTop: 8 }}>
                    Rotate now
                  </button>
                )}
              </div>
            )}

            <h4>Version history</h4>
            {versions.length === 0 ? (
              <p className="muted">No versions.</p>
            ) : (
              <ul>
                {versions.map((v) => (
                  <li key={v.versionNumber}>v{v.versionNumber}{v.isCurrent ? ' (current)' : ''}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <h2>Files</h2>
        {files.length === 0 ? <p className="muted">No files.</p> : (
          <ul>
            {files.map((f) => (
              <li key={f.id}>
                {f.name} ({f.size} bytes){' '}
                <a href={apiUrl(`/api/vault/files/${f.id}/download`)}>Download</a>
                {canDeleteFile && (
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => setDeleteFileId(f.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => void uploadFile(e)}>
          <input type="file" name="file" required />
          <button type="submit">Upload file</button>
        </form>
      </div>

      <Modal
        title="Rotate secret"
        open={rotateOpen}
        onClose={() => {
          setRotateOpen(false);
          setRotateValue('');
        }}
      >
        <p>Enter the new credential value. This creates a new encrypted version and updates rotation metadata.</p>
        <label>
          New value
          <input
            type="password"
            value={rotateValue}
            onChange={(e) => setRotateValue(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRotateOpen(false);
              setRotateValue('');
            }}
          >
            Cancel
          </button>
          <button type="button" onClick={() => void confirmRotate()} disabled={rotateLoading}>
            {rotateLoading ? 'Rotating…' : 'Rotate now'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteSecretOpen}
        title="Delete secret"
        message="Are you sure you want to delete this secret? This action cannot be undone from the UI."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onCancel={() => setDeleteSecretOpen(false)}
        onConfirm={() => void confirmDeleteSecret()}
      />

      <ConfirmDialog
        open={!!deleteFileId}
        title="Delete file"
        message="Are you sure you want to delete this file?"
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onCancel={() => setDeleteFileId(null)}
        onConfirm={() => void confirmDeleteFile()}
      />
    </div>
  );
}
