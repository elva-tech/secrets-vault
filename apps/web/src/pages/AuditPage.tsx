import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import { Modal } from '../components/Modal';

type AuditRow = {
  id: string;
  action: string;
  actorId: string;
  resourceType: string | null;
  resourceName: string | null;
  applicationId: string | null;
  environmentId: string | null;
  result: string;
  createdAt: string;
};

type AuditDetail = AuditRow & {
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export function AuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const limit = 25;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (action.trim()) params.set('action', action.trim());
      const res = await apiFetch<{ items: AuditRow[]; total: number; page: number }>(
        `/api/audit/logs?${params.toString()}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, action]);

  async function openDetail(id: string) {
    try {
      const res = await apiFetch<{ log: AuditDetail }>(`/api/audit/logs/${id}`);
      setDetail(res.log);
    } catch {
      setError('Failed to load log detail');
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="card">
      <h1>Audit Logs</h1>
      <p className="muted">Security events only — no secret or credential values are shown.</p>
      <div className="filter-row">
        <label>
          Filter by action
          <input
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            placeholder="e.g. SECRET_REVEALED"
          />
        </label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <p className="muted">Loading audit logs…</p>
      ) : items.length === 0 ? (
        <p className="muted">No audit entries match your filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Resource</th>
                <th>Result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.action}</td>
                  <td className="mono">{row.actorId.slice(-8)}</td>
                  <td>{row.resourceName ?? row.resourceType ?? '—'}</td>
                  <td>{row.result}</td>
                  <td>
                    <button type="button" className="secondary" onClick={() => void openDetail(row.id)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span className="muted">Page {page} of {pageCount} ({total} total)</span>
        <button
          type="button"
          className="secondary"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      <Modal title="Audit log detail" open={!!detail} onClose={() => setDetail(null)} wide>
        {detail && (
          <dl className="detail-grid">
            <dt>Action</dt>
            <dd>{detail.action}</dd>
            <dt>Result</dt>
            <dd>{detail.result}</dd>
            <dt>Time</dt>
            <dd>{new Date(detail.createdAt).toLocaleString()}</dd>
            <dt>Actor</dt>
            <dd className="mono">{detail.actorId}</dd>
            <dt>Resource</dt>
            <dd>{detail.resourceName ?? detail.resourceType ?? '—'}</dd>
            {detail.applicationId && (
              <>
                <dt>Application</dt>
                <dd className="mono">{detail.applicationId}</dd>
              </>
            )}
            {detail.environmentId && (
              <>
                <dt>Environment</dt>
                <dd className="mono">{detail.environmentId}</dd>
              </>
            )}
          </dl>
        )}
      </Modal>
    </div>
  );
}
