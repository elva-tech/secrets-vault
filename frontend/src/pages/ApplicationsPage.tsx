import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { Modal } from '../components/Modal';

type ApplicationRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status?: string;
  metadataPreview?: Array<{ label: string; value: string }>;
};

export function ApplicationsPage() {
  const { me } = useAuth();
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [envCounts, setEnvCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const canCreate = me?.permissions?.includes('application.create');

  async function loadEnvCounts(applicationIds: string[]) {
    const entries = await Promise.all(
      applicationIds.map(async (id) => {
        try {
          const res = await apiFetch<{ environments: unknown[] }>(
            `/api/applications/${id}/environments`,
          );
          return [id, res.environments.length] as const;
        } catch {
          return [id, 0] as const;
        }
      }),
    );
    setEnvCounts(Object.fromEntries(entries));
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await apiFetch<{ applications: ApplicationRow[] }>(`/api/applications${q}`);
      setApps(data.applications);
      void loadEnvCounts(data.applications.map((a) => a.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
      setApps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ name, slug, description: '' }),
      });
      setShowCreate(false);
      setName('');
      setSlug('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  return (
    <div className="workspace-page workspace-surface">
      <PageHeader
        title="Applications"
        description="Group secrets and environments by application. Open an application to manage environments and vault resources."
        actions={
          canCreate ? (
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              Create application
            </button>
          ) : undefined
        }
      />
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="workspace-filter-bar">
        <input
          placeholder="Search applications…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search applications"
        />
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>Search</button>
      </div>

      {loading ? (
        <LoadingState label="Loading applications…" />
      ) : apps.length === 0 ? (
        <EmptyState
          title="No applications"
          description="Create an application to organize environments and secrets."
          action={
            canCreate ? (
              <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
                Create application
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="workspace-app-grid" role="list">
          {apps.map((app) => {
            const envCount = envCounts[app.id];
            return (
              <Link
                key={app.id}
                to={`/applications/${app.id}`}
                className="workspace-app-card"
                role="listitem"
              >
                <div className="workspace-app-card-head">
                  <h2 className="workspace-app-card-title">{app.name}</h2>
                  <span className="workspace-app-badge">{app.slug}</span>
                </div>
                {app.status && (
                  <span className="workspace-app-badge workspace-app-badge--status">{app.status}</span>
                )}
                <p className="workspace-app-card-desc">
                  {app.description?.trim() || 'No description provided.'}
                </p>
                <p className="workspace-app-card-meta">
                  <strong>{envCount ?? '—'}</strong> environment{envCount === 1 ? '' : 's'}
                </p>
                <span className="workspace-app-card-footer">Open application →</span>
              </Link>
            );
          })}
        </div>
      )}

      <Modal title="Create application" open={showCreate} onClose={() => setShowCreate(false)}>
        <form className="form form-wide" onSubmit={(e) => void onCreate(e)}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Slug
            <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
