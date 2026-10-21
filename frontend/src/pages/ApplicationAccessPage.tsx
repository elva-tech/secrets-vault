import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../notifications/ToastContext';
import { apiErrorMessage } from '../lib/validation';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';

function requestStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending') return 'workspace-status-pill workspace-status-pill--pending';
  if (s === 'approved') return 'workspace-status-pill workspace-status-pill--approved';
  if (s === 'rejected') return 'workspace-status-pill workspace-status-pill--rejected';
  return 'workspace-status-pill';
}

type AccessRequest = {
  id: string;
  status: string;
  reason: string;
  requesterId: string;
  ownerId: string;
  applicationId: string;
  environmentId: string;
  resourceIds: string[];
  resourceType: string;
  permissions: string[];
  grantId?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  approvedBy?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
};

type Grant = {
  id: string;
  applicationId: string;
  environmentId: string;
  resourceIds: string[];
  permissions: string[];
  expiresAt: string;
  status: string;
};

export function ApplicationAccessPage() {
  const { applicationId } = useParams();
  const { push } = useToast();
  const [mine, setMine] = useState<AccessRequest[]>([]);
  const [inbox, setInbox] = useState<AccessRequest[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [myRes, inboxRes, grantRes] = await Promise.all([
        apiFetch<{ requests: AccessRequest[] }>('/api/access-requests/mine'),
        apiFetch<{ requests: AccessRequest[] }>('/api/access-requests/inbox'),
        apiFetch<{ grants: Grant[] }>('/api/access-grants/mine'),
      ]);
      setMine(
        applicationId
          ? myRes.requests.filter((r) => r.applicationId === applicationId)
          : myRes.requests,
      );
      setInbox(
        applicationId
          ? inboxRes.requests.filter((r) => r.applicationId === applicationId)
          : inboxRes.requests,
      );
      setGrants(
        applicationId
          ? grantRes.grants.filter((g) => g.applicationId === applicationId)
          : grantRes.grants,
      );
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load access data'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [applicationId]);

  async function approve(id: string) {
    if (decidingId) return;
    setDecidingId(id);
    setActionLoading(true);
    try {
      const res = await apiFetch<{ request: AccessRequest; grant: { expiresAt: string } }>(
        `/api/access-requests/${id}/approve`,
        { method: 'POST' },
      );
      push(
        'success',
        `Request approved. Access is active until ${new Date(res.grant.expiresAt).toLocaleString()}.`,
      );
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Approval failed'));
    } finally {
      setActionLoading(false);
      setDecidingId(null);
    }
  }

  async function reject(id: string) {
    if (decidingId) return;
    setDecidingId(id);
    setActionLoading(true);
    try {
      await apiFetch(`/api/access-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      push('success', 'Request rejected');
      setRejectId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Reject failed'));
    } finally {
      setActionLoading(false);
      setDecidingId(null);
    }
  }

  async function revokeGrant(id: string) {
    setActionLoading(true);
    try {
      await apiFetch(`/api/access-grants/${id}/revoke`, { method: 'POST' });
      push('success', 'Grant revoked');
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Failed to revoke grant'));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="workspace-page workspace-surface">
      {applicationId ? (
        <p className="workspace-breadcrumb"><Link to={`/applications/${applicationId}`}>← Application</Link></p>
      ) : (
        <p className="workspace-breadcrumb"><Link to="/applications">← Applications</Link></p>
      )}
      <PageHeader
        title="Access requests"
        description="Request access to protected resources and review pending requests in the portal. Approval grants temporary access—no email codes required."
      />
      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <LoadingState label="Loading access data…" />
      ) : (
        <div>
          <>
            <h2>My requests</h2>
            {mine.length === 0 ? (
              <p className="muted">You have no access requests.</p>
            ) : (
              <ul className="workspace-request-list">
                {mine.map((r) => (
                  <li key={r.id} className="workspace-request-card">
                    <span className={requestStatusClass(r.status)}>{r.status}</span>
                    <p>{r.reason}</p>
                    <p className="muted">
                      {r.resourceType} — {r.resourceIds.length} resource(s) —{' '}
                      {r.permissions.join(', ')}
                      {r.createdAt && ` — ${new Date(r.createdAt).toLocaleString()}`}
                    </p>
                    {r.status === 'PENDING' && (
                      <p className="muted">Waiting for an approver to review this request.</p>
                    )}
                    {r.status === 'APPROVED' && r.approvedAt && (
                      <p className="muted">
                        Approved {new Date(r.approvedAt).toLocaleString()}
                        {r.grantId ? ' — check temporary access below.' : ''}
                      </p>
                    )}
                    {r.status === 'REJECTED' && (
                      <p className="muted">
                        Declined{r.rejectionReason ? `: ${r.rejectionReason}` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h2>Requests for my resources</h2>
            {inbox.length === 0 ? (
              <p className="muted">No pending requests.</p>
            ) : (
              <ul className="workspace-request-list">
                {inbox.map((r) => (
                  <li key={r.id} className="workspace-request-card">
                    <p>{r.reason}</p>
                    <span className={requestStatusClass(r.status)}>{r.status}</span>
                    <p className="muted">
                      {r.resourceType} — {r.permissions.join(', ')}
                    </p>
                    {r.status === 'PENDING' && (
                      <div className="action-row">
                        <button
                          type="button"
                          onClick={() => void approve(r.id)}
                          disabled={actionLoading || decidingId === r.id}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setRejectId(r.id)}
                          disabled={actionLoading}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h2>Temporary access</h2>
            {grants.length === 0 ? (
              <p className="muted">No active grants.</p>
            ) : (
              <ul>
                {grants.map((g) => (
                  <li key={g.id}>
                    <span className={`status-pill status-${g.status.toLowerCase()}`}>{g.status}</span>
                    {g.resourceIds.length} resource(s) — expires {new Date(g.expiresAt).toLocaleString()}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void revokeGrant(g.id)}
                      disabled={actionLoading}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        </div>
      )}

      <ConfirmDialog
        open={!!rejectId}
        title="Reject request"
        message="Are you sure you want to reject this access request?"
        confirmLabel="Reject"
        destructive
        loading={actionLoading}
        onCancel={() => {
          setRejectId(null);
          setRejectReason('');
        }}
        onConfirm={() => rejectId && void reject(rejectId)}
      >
        <label className="confirm-reason">
          Optional reason
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
