import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../notifications/ToastContext';
import { apiErrorMessage } from '../lib/validation';

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
  const [otpRequestId, setOtpRequestId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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
    setActionLoading(true);
    try {
      await apiFetch(`/api/access-requests/${id}/approve`, { method: 'POST' });
      push('success', 'Request approved. The requester can verify OTP to receive temporary access.');
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Approval failed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function reject(id: string) {
    setActionLoading(true);
    try {
      await apiFetch(`/api/access-requests/${id}/reject`, { method: 'POST' });
      push('success', 'Request rejected');
      setRejectId(null);
      await load();
    } catch (err) {
      push('error', apiErrorMessage(err, 'Reject failed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ grant: { expiresAt: string } }>(
        `/api/access-requests/${otpRequestId}/verify-otp`,
        { method: 'POST', body: JSON.stringify({ code: otpCode }) },
      );
      push('success', `Access granted until ${new Date(res.grant.expiresAt).toLocaleString()}`);
      setOtpCode('');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'OTP verification failed'));
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

  const otpPending = mine.filter((r) => r.status === 'OTP_GENERATED' || r.status === 'APPROVED');

  return (
    <div>
      {applicationId ? (
        <p><Link to={`/applications/${applicationId}`}>← Application</Link></p>
      ) : (
        <p><Link to="/applications">← Applications</Link></p>
      )}
      <div className="card">
        <h1>Access Requests</h1>
        {error && <div className="error-banner">{error}</div>}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <h2>My requests</h2>
            {mine.length === 0 ? (
              <p className="muted">You have no access requests.</p>
            ) : (
              <ul className="request-list">
                {mine.map((r) => (
                  <li key={r.id} className="card nested-card">
                    <strong>{r.status}</strong>
                    <p>{r.reason}</p>
                    <p className="muted">
                      {r.resourceType} — {r.resourceIds.length} resource(s)
                      {r.createdAt && ` — ${new Date(r.createdAt).toLocaleString()}`}
                    </p>
                    {(r.status === 'OTP_GENERATED' || r.status === 'APPROVED') && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setOtpRequestId(r.id)}
                      >
                        Verify OTP for this request
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h2>Requests for my resources</h2>
            {inbox.length === 0 ? (
              <p className="muted">No pending requests.</p>
            ) : (
              <ul className="request-list">
                {inbox.map((r) => (
                  <li key={r.id} className="card nested-card">
                    <p>{r.reason}</p>
                    <p className="muted">Status: {r.status}</p>
                    {r.status === 'PENDING' && (
                      <div className="action-row">
                        <button type="button" onClick={() => void approve(r.id)} disabled={actionLoading}>
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

            <h2>Verify OTP</h2>
            {otpPending.length > 0 && !otpRequestId && (
              <p className="muted">Select a request above or enter the request ID below.</p>
            )}
            <form className="form" onSubmit={(e) => void verifyOtp(e)}>
              <label>
                Request
                <select
                  value={otpRequestId}
                  onChange={(e) => setOtpRequestId(e.target.value)}
                  required
                >
                  <option value="">Select request…</option>
                  {otpPending.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.reason.slice(0, 40)} — {r.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                OTP (6 digits)
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  pattern="\d{6}"
                  maxLength={6}
                  inputMode="numeric"
                  required
                  autoComplete="one-time-code"
                />
              </label>
              <button type="submit">Verify OTP</button>
            </form>

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
        )}
      </div>

      <ConfirmDialog
        open={!!rejectId}
        title="Reject request"
        message="Are you sure you want to reject this access request?"
        confirmLabel="Reject"
        destructive
        loading={actionLoading}
        onCancel={() => setRejectId(null)}
        onConfirm={() => rejectId && void reject(rejectId)}
      />
    </div>
  );
}
