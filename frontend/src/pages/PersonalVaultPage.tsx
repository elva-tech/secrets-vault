import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, apiUrl } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { useToast } from '../notifications/ToastContext';
import { apiErrorMessage } from '../lib/validation';

type SecretRow = { id: string; name: string; type: string; masked: boolean };
type FileRow = { id: string; name: string; size: number };

export function PersonalVaultPage() {
  const { push } = useToast();
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateValue, setUpdateValue] = useState('');
  const [deleteSecretId, setDeleteSecretId] = useState<string | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const s = await apiFetch<{ secrets: SecretRow[] }>('/api/personal-vault/secrets');
      setSecrets(s.secrets);
      const f = await apiFetch<{ files: FileRow[] }>('/api/personal-vault/files');
      setFiles(f.files);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load personal vault'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createSecret(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/personal-vault/secrets', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: 'PASSWORD',
          value: { password: value },
        }),
      });
      setName('');
      setValue('');
      push('success', 'Personal secret created');
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to create secret'));
    }
  }

  async function reveal(id: string) {
    setSelectedId(id);
    setRevealed(null);
    try {
      const res = await apiFetch<{ value: { password?: string } }>(
        `/api/personal-vault/secrets/${id}/reveal`,
        { method: 'POST' },
      );
      setRevealed(res.value.password ?? '—');
    } catch (err) {
      push('error', apiErrorMessage(err, 'Reveal failed'));
    }
  }

  async function saveUpdate() {
    if (!selectedId || !updateValue) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/personal-vault/secrets/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          value: { password: updateValue },
          reason: 'Updated from UI',
        }),
      });
      push('success', 'Secret updated');
      setUpdateOpen(false);
      setUpdateValue('');
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Update failed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDeleteSecret() {
    if (!deleteSecretId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/personal-vault/secrets/${deleteSecretId}`, { method: 'DELETE' });
      push('success', 'Secret deleted');
      if (selectedId === deleteSecretId) {
        setSelectedId(null);
        setRevealed(null);
      }
      setDeleteSecretId(null);
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Delete failed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDeleteFile() {
    if (!deleteFileId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/personal-vault/files/${deleteFileId}`, { method: 'DELETE' });
      push('success', 'File deleted');
      setDeleteFileId(null);
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Delete failed'));
    } finally {
      setActionLoading(false);
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
    const res = await fetch(apiUrl('/api/personal-vault/files'), {
      method: 'POST',
      credentials: 'include',
      body: data,
    });
    if (!res.ok) {
      push('error', 'Upload failed');
      return;
    }
    push('success', 'File uploaded');
    form.reset();
    await load();
  }

  return (
    <div className="card personal-vault">
      <h1>Personal Vault</h1>
      <p className="muted">Private secrets and files — visible only to you.</p>
      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <h2>Secrets</h2>
          {secrets.length === 0 ? (
            <p className="muted">No personal secrets yet.</p>
          ) : (
            <ul className="item-list">
              {secrets.map((s) => (
                <li key={s.id} className="action-row">
                  <span>{s.name} ({s.type})</span>
                  <button type="button" className="secondary" onClick={() => void reveal(s.id)}>Reveal</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setSelectedId(s.id);
                      setUpdateOpen(true);
                    }}
                  >
                    Update
                  </button>
                  <button type="button" className="danger-text" onClick={() => setDeleteSecretId(s.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedId && revealed && <pre className="reveal-box">{revealed}</pre>}
          <form className="form" onSubmit={(e) => void createSecret(e)}>
            <h3>Add secret</h3>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Value<input type="password" value={value} onChange={(e) => setValue(e.target.value)} required /></label>
            <button type="submit">Create</button>
          </form>

          <h2>Files</h2>
          {files.length === 0 ? (
            <p className="muted">No files.</p>
          ) : (
            <ul>
              {files.map((f) => (
                <li key={f.id}>
                  {f.name} ({f.size} bytes){' '}
                  <a href={apiUrl(`/api/personal-vault/files/${f.id}/download`)}>Download</a>
                  <button type="button" className="danger-text" onClick={() => setDeleteFileId(f.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => void uploadFile(e)}>
            <input type="file" name="file" required />
            <button type="submit">Upload file</button>
          </form>
          <p className="muted small-note">Version history is not exposed by the personal vault API.</p>
        </>
      )}

      <Modal title="Update personal secret" open={updateOpen} onClose={() => setUpdateOpen(false)}>
        <label>
          New value
          <input
            type="password"
            value={updateValue}
            onChange={(e) => setUpdateValue(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={() => setUpdateOpen(false)}>Cancel</button>
          <button type="button" onClick={() => void saveUpdate()} disabled={actionLoading}>
            {actionLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteSecretId}
        title="Delete secret"
        message="Are you sure you want to delete this personal secret?"
        confirmLabel="Delete"
        destructive
        loading={actionLoading}
        onCancel={() => setDeleteSecretId(null)}
        onConfirm={() => void confirmDeleteSecret()}
      />

      <ConfirmDialog
        open={!!deleteFileId}
        title="Delete file"
        message="Are you sure you want to delete this file?"
        confirmLabel="Delete"
        destructive
        loading={actionLoading}
        onCancel={() => setDeleteFileId(null)}
        onConfirm={() => void confirmDeleteFile()}
      />
    </div>
  );
}
