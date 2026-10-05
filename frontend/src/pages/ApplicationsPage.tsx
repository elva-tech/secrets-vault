import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

type ApplicationRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  metadataPreview?: Array<{ label: string; value: string }>;
};

export function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  async function load() {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await apiFetch<{ applications: ApplicationRow[] }>(`/api/applications${q}`);
      setApps(data.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
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
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Applications</h1>
        <button type="button" onClick={() => setShowCreate((v) => !v)}>New application</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ margin: '1rem 0', display: 'flex', gap: 8 }}>
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="secondary" onClick={() => void load()}>Search</button>
      </div>
      {showCreate && (
        <form className="form" onSubmit={(e) => void onCreate(e)} style={{ marginBottom: 16 }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>Slug<input value={slug} onChange={(e) => setSlug(e.target.value)} required /></label>
          <button type="submit">Create</button>
        </form>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {apps.map((app) => (
          <Link key={app.id} to={`/applications/${app.id}`} className="card" style={{ display: 'block' }}>
            <strong>{app.name}</strong>
            <p className="muted">{app.description || 'No description'}</p>
            <p className="muted">
              {(app.metadataPreview ?? []).map((m) => m.value).join(' • ')}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
