import { FormEvent, Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, apiUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../notifications/ToastContext';
import { apiErrorMessage } from '../lib/validation';
import { formatSecretValue } from '../lib/formatSecretValue';
import { useTimedSecretReveal } from '../hooks/useTimedSecretReveal';
import { RotateSecretValueInput } from '../components/vault/RotateSecretValueInput';
import '../vault-ui.css';

type Environment = { id: string; name: string; slug: string; description?: string };
type SecretRow = {
  id: string;
  name: string;
  type: string;
  masked: boolean;
  currentVersionNumber: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};
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

const SECRET_TYPES = [
  'PASSWORD',
  'KEY_VALUE',
  'TEXT',
  'API_KEY',
  'TOKEN',
  'CERTIFICATE',
] as const;

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function envAccentClass(env: Environment): string {
  const slug = env.slug.toLowerCase();
  if (slug === 'prod' || slug === 'production') return 'vault-env-card--prod';
  return '';
}

export function ApplicationVaultPage() {
  const { applicationId } = useParams();
  const { me } = useAuth();
  const { push } = useToast();
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const [applicationName, setApplicationName] = useState('');
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [envId, setEnvId] = useState('');
  const [envSecretCounts, setEnvSecretCounts] = useState<Record<string, number>>({});
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [expandedSecretId, setExpandedSecretId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<SecretDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [rotation, setRotation] = useState<RotationMeta | null>(null);
  const [rotationType, setRotationType] = useState('NO_EXPIRY');
  const [customDate, setCustomDate] = useState('');
  const [rotationSaving, setRotationSaving] = useState(false);
  const {
    revealed,
    progressRemaining,
    secondsLeft,
    beginReveal,
    hideRevealed,
  } = useTimedSecretReveal();
  const [revealLoading, setRevealLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [versions, setVersions] = useState<Array<{ versionNumber: number; isCurrent: boolean }>>([]);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [accessReason, setAccessReason] = useState('');
  const [policyNonOwner, setPolicyNonOwner] = useState('APPROVAL_REQUIRED');
  const [rotateValue, setRotateValue] = useState('');
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [deleteSecretOpen, setDeleteSecretOpen] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [secretType, setSecretType] = useState<string>('PASSWORD');
  const [secretDescription, setSecretDescription] = useState('');

  const canCreateSecret = me?.permissions?.includes('secret.create');
  const canReveal = me?.permissions?.includes('secret.reveal');
  const canCopy = me?.permissions?.includes('secret.copy');
  const canRotate = me?.permissions?.includes('secret.rotate');
  const canEditSecret = me?.permissions?.includes('secret.edit');
  const canDeleteSecret = me?.permissions?.includes('secret.delete');
  const canDeleteFile = me?.permissions?.includes('file.delete');
  const canCreateEnv = me?.permissions?.includes('environment.create');

  const selectedEnv = environments.find((e) => e.id === envId);

  const clearDetailState = useCallback(() => {
    setSelected(null);
    hideRevealed();
    setApprovalRequired(false);
    setDetailError(null);
    setRotation(null);
    setVersions([]);
    setAccessReason('');
    setPolicyNonOwner('APPROVAL_REQUIRED');
    setRotationType('NO_EXPIRY');
    setCustomDate('');
  }, [hideRevealed]);

  const resetCreateForm = useCallback(() => {
    setSecretName('');
    setSecretValue('');
    setSecretType('PASSWORD');
    setSecretDescription('');
    setCreateError(null);
  }, []);

  async function refreshEnvCounts(envs: Environment[]) {
    if (!applicationId) return;
    const entries = await Promise.all(
      envs.map(async (env) => {
        try {
          const res = await apiFetch<{ secrets: SecretRow[] }>(
            `/api/vault/applications/${applicationId}/environments/${env.id}/secrets`,
          );
          return [env.id, res.secrets.length] as const;
        } catch {
          return [env.id, 0] as const;
        }
      }),
    );
    setEnvSecretCounts(Object.fromEntries(entries));
  }

  useEffect(() => {
    if (!applicationId) return;
    setPageLoading(true);
    void (async () => {
      try {
        const appRes = await apiFetch<{ application: { name: string } }>(
          `/api/applications/${applicationId}`,
        );
        setApplicationName(appRes.application.name);
        const envRes = await apiFetch<{ environments: Environment[] }>(
          `/api/applications/${applicationId}/environments`,
        );
        setEnvironments(envRes.environments);
        if (envRes.environments[0]) setEnvId(envRes.environments[0].id);
        void refreshEnvCounts(envRes.environments);
      } catch (err) {
        setVaultError(apiErrorMessage(err, 'Failed to load application vault'));
      } finally {
        setPageLoading(false);
      }
    })();
  }, [applicationId]);

  const loadVault = useCallback(async () => {
    if (!applicationId || !envId) return;
    setVaultLoading(true);
    setVaultError(null);
    try {
      const s = await apiFetch<{ secrets: SecretRow[] }>(
        `/api/vault/applications/${applicationId}/environments/${envId}/secrets`,
      );
      setSecrets(s.secrets);
      setEnvSecretCounts((prev) => ({ ...prev, [envId]: s.secrets.length }));
      const f = await apiFetch<{ files: FileRow[] }>(
        `/api/vault/applications/${applicationId}/environments/${envId}/files`,
      );
      setFiles(f.files);
    } catch (err) {
      setVaultError(apiErrorMessage(err, 'Failed to load vault resources'));
      setSecrets([]);
      setFiles([]);
    } finally {
      setVaultLoading(false);
    }
  }, [applicationId, envId]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  useEffect(() => () => {
    hideRevealed();
    setSecretValue('');
    setRotateValue('');
  }, [hideRevealed]);

  function closeRotateModal() {
    setRotateOpen(false);
    setRotateValue('');
  }

  function selectEnvironment(id: string) {
    if (id === envId) return;
    setEnvId(id);
    setExpandedSecretId(null);
    clearDetailState();
    setCreateOpen(false);
    resetCreateForm();
    setSearchQuery('');
  }

  useEffect(() => {
    if (!createOpen) {
      createButtonRef.current?.focus();
    }
  }, [createOpen]);

  async function loadSecretDetail(id: string) {
    setDetailLoading(true);
    setDetailError(null);
    clearDetailState();
    try {
      const res = await apiFetch<{ secret: SecretDetail & { rotation?: RotationMeta } }>(
        `/api/vault/secrets/${id}`,
      );
      setSelected(res.secret);
      const rot = res.secret.rotation;
      if (rot) {
        setRotation(rot);
        setRotationType(rot.rotationType ?? 'NO_EXPIRY');
        if (rot.customRotationDate) setCustomDate(rot.customRotationDate.slice(0, 10));
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
    } catch (err) {
      setDetailError(apiErrorMessage(err, 'Failed to load secret details'));
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleSecretRow(id: string) {
    if (expandedSecretId === id) {
      setExpandedSecretId(null);
      clearDetailState();
      return;
    }
    setExpandedSecretId(id);
    void loadSecretDetail(id);
  }

  async function createSecret(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);
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
          description: secretDescription.trim() || undefined,
          value,
        }),
      });
      push('success', 'Secret created');
      setCreateOpen(false);
      resetCreateForm();
      await loadVault();
      if (environments.length) void refreshEnvCounts(environments);
    } catch (err) {
      setCreateError(apiErrorMessage(err, 'Failed to create secret'));
    } finally {
      setCreateSubmitting(false);
    }
  }

  function handleSensitiveError(err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === 'APPROVAL_REQUIRED') {
      setApprovalRequired(true);
      return;
    }
    setDetailError(e.message);
  }

  async function revealSecret() {
    if (!selected) return;
    setApprovalRequired(false);
    setDetailError(null);
    setRevealLoading(true);
    try {
      const res = await apiFetch<{ value: { password?: string; value?: string; key?: string } }>(
        `/api/vault/secrets/${selected.id}/reveal`,
        { method: 'POST' },
      );
      beginReveal(selected.id, formatSecretValue(res.value));
    } catch (err) {
      handleSensitiveError(err);
    } finally {
      setRevealLoading(false);
    }
  }

  async function copySecret() {
    if (!selected) return;
    setApprovalRequired(false);
    setDetailError(null);
    setCopyLoading(true);
    try {
      const res = await apiFetch<{ value: { password?: string; value?: string; key?: string } }>(
        `/api/vault/secrets/${selected.id}/copy`,
        { method: 'POST' },
      );
      const text = formatSecretValue(res.value);
      await navigator.clipboard.writeText(text);
      push('success', 'Secret copied to clipboard');
    } catch (err) {
      handleSensitiveError(err);
    } finally {
      setCopyLoading(false);
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
      const body: { rotationType: string; customRotationDate?: string } = { rotationType };
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
      closeRotateModal();
      if (expandedSecretId) await loadSecretDetail(expandedSecretId);
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
      setExpandedSecretId(null);
      clearDetailState();
      setDeleteSecretOpen(false);
      await loadVault();
      if (environments.length) void refreshEnvCounts(environments);
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
    if (fileUploading || !applicationId || !envId) return;
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    if (!fileInput.files?.[0]) return;
    const data = new FormData();
    data.append('file', fileInput.files[0]);
    data.append('name', fileInput.files[0].name);
    setFileUploading(true);
    try {
      await apiFetch(`/api/vault/applications/${applicationId}/environments/${envId}/files`, {
        method: 'POST',
        body: data,
      });
      push('success', 'File uploaded');
      await loadVault();
      form.reset();
    } catch (err) {
      push('error', apiErrorMessage(err, 'File upload failed'));
    } finally {
      setFileUploading(false);
    }
  }

  const filteredSecrets = searchQuery.trim()
    ? secrets.filter((s) => s.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : secrets;

  if (pageLoading) {
    return <LoadingState label="Loading vault…" />;
  }

  return (
    <div className="vault-page">
      <nav className="vault-breadcrumb" aria-label="Breadcrumb">
        <Link to="/applications">Applications</Link>
        <span className="vault-breadcrumb-sep" aria-hidden="true">/</span>
        <Link to={`/applications/${applicationId}`}>{applicationName || 'Application'}</Link>
        <span className="vault-breadcrumb-sep" aria-hidden="true">/</span>
        <span className="vault-breadcrumb-current">Vault</span>
      </nav>

      <PageHeader
        title="Application vault"
        description="Manage environment-scoped secrets and encrypted files for this application. Select an environment to view and create secrets."
      />

      {vaultError && !vaultLoading && secrets.length === 0 && environments.length > 0 && (
        <div className="error-banner" role="alert">{vaultError}</div>
      )}

      {environments.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No environments yet"
            description="Create environments for this application before adding secrets to the vault."
            action={
              canCreateEnv ? (
                <Link className="btn btn-primary" to={`/applications/${applicationId}`}>
                  Manage environments
                </Link>
              ) : (
                <Link className="btn btn-secondary" to={`/applications/${applicationId}`}>
                  Back to application
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="vault-env-grid" role="list">
            {environments.map((env) => {
              const selected = env.id === envId;
              const accent = envAccentClass(env);
              const count = envSecretCounts[env.id];
              return (
                <button
                  key={env.id}
                  type="button"
                  role="listitem"
                  className={`vault-env-card${selected ? ' vault-env-card--selected' : ''}${accent ? ` ${accent}` : ''}`}
                  aria-pressed={selected}
                  aria-label={`${env.name} environment, ${count ?? 'unknown'} secrets`}
                  onClick={() => selectEnvironment(env.id)}
                >
                  <div className="vault-env-card-head">
                    <h3 className="vault-env-card-name">{env.name}</h3>
                    <span className="vault-env-badge">{env.slug}</span>
                  </div>
                  {env.description ? (
                    <p className="vault-env-card-desc">{env.description}</p>
                  ) : (
                    <p className="vault-env-card-desc">Environment {env.slug}</p>
                  )}
                  <p className="vault-env-card-meta">
                    <strong>{count ?? '—'}</strong> secret{count === 1 ? '' : 's'}
                  </p>
                  {selected && (
                    <span className="vault-env-selected-label">Selected environment</span>
                  )}
                </button>
              );
            })}
          </div>

          <section className="vault-section" aria-labelledby="vault-secrets-heading">
            <div className="vault-section-header">
              <div>
                <h2 id="vault-secrets-heading" className="vault-section-title">Secrets</h2>
                <p className="vault-section-context">
                  {selectedEnv ? (
                    <>
                      Showing secrets for
                      <span className="vault-env-pill">{selectedEnv.name}</span>
                    </>
                  ) : (
                    'Select an environment'
                  )}
                </p>
              </div>
              {canCreateSecret && selectedEnv && (
                <button
                  ref={createButtonRef}
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    resetCreateForm();
                    setCreateOpen(true);
                  }}
                >
                  + Create Secret
                </button>
              )}
            </div>

            {secrets.length > 3 && (
              <div className="vault-search">
                <label className="sr-only" htmlFor="vault-secret-search">Search secrets</label>
                <input
                  id="vault-secret-search"
                  type="search"
                  placeholder="Search by name…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {vaultLoading ? (
              <LoadingState label="Loading secrets…" />
            ) : vaultError && secrets.length === 0 ? (
              <div className="error-banner" role="alert">{vaultError}</div>
            ) : secrets.length === 0 ? (
              <div className="card">
                <EmptyState
                  title="No secrets in this environment"
                  description="Create a secret to store credentials and configuration for this environment."
                  action={
                    canCreateSecret ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          resetCreateForm();
                          setCreateOpen(true);
                        }}
                      >
                        + Create Secret
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : filteredSecrets.length === 0 ? (
              <p className="muted">No secrets match your search.</p>
            ) : (
              <div className="vault-secrets-table-wrap">
                <table className="vault-secrets-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Type</th>
                      <th scope="col">Version</th>
                      <th scope="col">Last updated</th>
                      <th scope="col"><span className="sr-only">Expand</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSecrets.map((s) => {
                      const expanded = expandedSecretId === s.id;
                      return (
                        <Fragment key={s.id}>
                          <tr
                            className={`vault-secret-row${expanded ? ' vault-secret-row--expanded' : ''}`}
                            onClick={() => toggleSecretRow(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleSecretRow(s.id);
                              }
                            }}
                            tabIndex={0}
                            aria-expanded={expanded}
                          >
                            <td className="vault-secret-name-cell">{s.name}</td>
                            <td><span className="vault-type-badge">{s.type}</span></td>
                            <td>v{s.currentVersionNumber}</td>
                            <td>{formatDate(s.updatedAt)}</td>
                            <td className="vault-secret-row-actions">
                              <button
                                type="button"
                                className="vault-row-chevron"
                                aria-label={expanded ? 'Collapse details' : 'Expand details'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSecretRow(s.id);
                                }}
                              >
                                {expanded ? '▾' : '▸'}
                              </button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="vault-secret-detail-row">
                              <td colSpan={5}>
                                <div className="vault-secret-detail">
                                  {detailLoading ? (
                                    <LoadingState label="Loading secret details…" />
                                  ) : detailError ? (
                                    <div className="error-banner" role="alert">{detailError}</div>
                                  ) : selected ? (
                                    <>
                                      <section className="vault-detail-section" aria-label="Overview">
                                        <h4 className="vault-detail-section__title">Overview</h4>
                                        <p className="vault-detail-section__lead">{selected.name}</p>
                                        <dl className="vault-secret-detail-grid">
                                          <div>
                                            <dt>Type</dt>
                                            <dd>{selected.type}</dd>
                                          </div>
                                          <div>
                                            <dt>Version</dt>
                                            <dd>v{selected.currentVersionNumber}</dd>
                                          </div>
                                          <div>
                                            <dt>Created</dt>
                                            <dd>{formatDate(selected.createdAt)}</dd>
                                          </div>
                                          <div>
                                            <dt>Last updated</dt>
                                            <dd>{formatDate(selected.updatedAt)}</dd>
                                          </div>
                                          {selected.description && (
                                            <div className="vault-detail-span-full">
                                              <dt>Description</dt>
                                              <dd>{selected.description}</dd>
                                            </div>
                                          )}
                                        </dl>
                                      </section>

                                      <section className="vault-detail-section" aria-label="Secret value">
                                        <h4 className="vault-detail-section__title">Secret value</h4>
                                        {revealed ? (
                                          <>
                                            <pre className="reveal-box">{revealed}</pre>
                                            <div
                                              className="vault-reveal-timer"
                                              role="progressbar"
                                              aria-label="Secret visibility time remaining"
                                              aria-valuemin={0}
                                              aria-valuemax={100}
                                              aria-valuenow={Math.round(progressRemaining)}
                                            >
                                              <div
                                                className="vault-reveal-timer__fill"
                                                style={{ width: `${progressRemaining}%` }}
                                              />
                                            </div>
                                            <p className="vault-reveal-timer-hint muted">
                                              Automatically hides in {secondsLeft} second{secondsLeft === 1 ? '' : 's'}
                                            </p>
                                          </>
                                        ) : (
                                          <p className="vault-masked-value" aria-hidden="true">
                                            ••••••••••••••••
                                          </p>
                                        )}
                                        <div className="vault-value-actions">
                                          {canReveal && revealed && (
                                            <button
                                              type="button"
                                              className="btn btn-secondary btn-sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                hideRevealed();
                                              }}
                                            >
                                              Hide
                                            </button>
                                          )}
                                          {canReveal && (
                                            <button
                                              type="button"
                                              className="btn btn-secondary btn-sm"
                                              disabled={revealLoading}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void revealSecret();
                                              }}
                                            >
                                              {revealLoading ? 'Revealing…' : 'Reveal'}
                                            </button>
                                          )}
                                          {canCopy && (
                                            <button
                                              type="button"
                                              className="btn btn-secondary btn-sm"
                                              disabled={copyLoading}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void copySecret();
                                              }}
                                            >
                                              {copyLoading ? 'Copying…' : 'Copy'}
                                            </button>
                                          )}
                                          {canDeleteSecret && (
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-danger-outline"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteSecretOpen(true);
                                              }}
                                            >
                                              Delete
                                            </button>
                                          )}
                                        </div>
                                      </section>

                                      {approvalRequired && (
                                        <section
                                          className="vault-detail-section vault-detail-section--access"
                                          aria-label="Access required"
                                        >
                                          <h4 className="vault-detail-section__title">Access required</h4>
                                          <p className="muted">
                                            Approval is required before you can reveal or copy this secret.
                                          </p>
                                          <form className="form form-wide" onSubmit={(e) => void requestAccess(e)}>
                                            <label>
                                              Reason
                                              <textarea
                                                value={accessReason}
                                                onChange={(ev) => setAccessReason(ev.target.value)}
                                                required
                                                minLength={3}
                                              />
                                            </label>
                                            <button type="submit" className="btn btn-primary btn-sm">
                                              Request access
                                            </button>
                                          </form>
                                        </section>
                                      )}

                                      <section className="vault-detail-section" aria-label="Resource access policy">
                                        <h4 className="vault-detail-section__title">Resource access policy</h4>
                                        <label>
                                          Non-owner behavior
                                          <select
                                            value={policyNonOwner}
                                            onChange={(e) => setPolicyNonOwner(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <option value="DENY">DENY</option>
                                            <option value="ALLOW">ALLOW</option>
                                            <option value="APPROVAL_REQUIRED">APPROVAL_REQUIRED</option>
                                          </select>
                                        </label>
                                        <div className="vault-detail-actions">
                                          <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void savePolicy();
                                            }}
                                          >
                                            Save policy
                                          </button>
                                        </div>
                                      </section>

                                      {(canEditSecret || canRotate) && (
                                        <section className="vault-detail-section" aria-label="Rotation">
                                          <h4 className="vault-detail-section__title">Rotation</h4>
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
                                              <label onClick={(e) => e.stopPropagation()}>
                                                Schedule
                                                <select
                                                  value={rotationType}
                                                  onChange={(e) => setRotationType(e.target.value)}
                                                >
                                                  {ROTATION_OPTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                  ))}
                                                </select>
                                              </label>
                                              {rotationType === 'CUSTOM_DATE' && (
                                                <label onClick={(e) => e.stopPropagation()}>
                                                  Custom date
                                                  <input
                                                    type="date"
                                                    value={customDate}
                                                    onChange={(e) => setCustomDate(e.target.value)}
                                                    required
                                                  />
                                                </label>
                                              )}
                                              <div className="vault-detail-actions">
                                                <button
                                                  type="button"
                                                  className="btn btn-secondary btn-sm"
                                                  disabled={rotationSaving}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    void saveRotation();
                                                  }}
                                                >
                                                  {rotationSaving ? 'Saving…' : 'Save rotation settings'}
                                                </button>
                                              </div>
                                            </>
                                          )}
                                          {canRotate && (
                                            <div className="vault-detail-actions">
                                              <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setRotateOpen(true);
                                                }}
                                              >
                                                Rotate now
                                              </button>
                                            </div>
                                          )}
                                        </section>
                                      )}

                                      <section className="vault-detail-section" aria-label="Version history">
                                        <h4 className="vault-detail-section__title">Version history</h4>
                                        {versions.length === 0 ? (
                                          <p className="muted">No versions.</p>
                                        ) : (
                                          <ul>
                                            {versions.map((v) => (
                                              <li key={v.versionNumber}>
                                                v{v.versionNumber}{v.isCurrent ? ' (current)' : ''}
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </section>
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="vault-files-section" aria-labelledby="vault-files-heading">
            <h2 id="vault-files-heading">Encrypted files</h2>
            <p className="vault-files-lead">
              Upload and download sensitive files for the selected environment. Files are stored encrypted
              using the same vault policies as secrets.
            </p>
            {vaultLoading ? (
              <LoadingState label="Loading files…" />
            ) : files.length === 0 ? (
              <p className="vault-files-empty">No files in this environment yet. Upload a file below.</p>
            ) : (
              <ul className="vault-file-list">
                {files.map((f) => (
                  <li key={f.id}>
                    <span className="vault-file-name">{f.name}</span>
                    <span className="muted">{f.size} bytes</span>
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
            <form className="vault-files-upload" onSubmit={(e) => void uploadFile(e)}>
              <label>
                Choose file
                <input type="file" name="file" required />
              </label>
              <button type="submit" className="btn btn-secondary btn-sm" disabled={fileUploading}>
                {fileUploading ? 'Uploading…' : 'Upload'}
              </button>
            </form>
          </section>
        </>
      )}

      <Modal
        title="Create Secret"
        open={createOpen}
        onClose={() => {
          if (createSubmitting) return;
          setCreateOpen(false);
          resetCreateForm();
        }}
      >
        <p className="vault-create-modal-intro">
          Adding a secret to <strong>{applicationName}</strong>
          {selectedEnv && (
            <>
              {' '}
              in environment <span className="vault-env-pill">{selectedEnv.name}</span>
            </>
          )}
        </p>
        {createError && <div className="error-banner" role="alert">{createError}</div>}
        <form
          className="form form-wide"
          onSubmit={(e) => void createSecret(e)}
        >
          <label>
            Secret type
            <select
              value={secretType}
              onChange={(e) => setSecretType(e.target.value)}
              disabled={createSubmitting}
            >
              {SECRET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Secret name
            <input
              value={secretName}
              onChange={(e) => setSecretName(e.target.value)}
              required
              disabled={createSubmitting}
              autoComplete="off"
            />
          </label>
          <label>
            Description <span className="muted">(optional)</span>
            <textarea
              value={secretDescription}
              onChange={(e) => setSecretDescription(e.target.value)}
              rows={2}
              disabled={createSubmitting}
            />
          </label>
          <label>
            Secret value
            <input
              type="password"
              value={secretValue}
              onChange={(e) => setSecretValue(e.target.value)}
              required
              disabled={createSubmitting}
              autoComplete="new-password"
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={createSubmitting}
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={createSubmitting}>
              {createSubmitting ? 'Creating…' : 'Create Secret'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title="Rotate secret"
        open={rotateOpen}
        onClose={() => {
          if (rotateLoading) return;
          closeRotateModal();
        }}
      >
        <p>Enter the new credential value. This creates a new encrypted version and updates rotation metadata.</p>
        <RotateSecretValueInput
          value={rotateValue}
          onChange={setRotateValue}
          disabled={rotateLoading}
        />
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={rotateLoading}
            onClick={closeRotateModal}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void confirmRotate()} disabled={rotateLoading}>
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
