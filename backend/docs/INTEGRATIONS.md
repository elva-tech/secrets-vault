# Secrets Vault — ELVA Notify & Cloudinary

Server-only integrations for transactional email and encrypted vault file blobs.

## ELVA Notify (transactional email)

API base (default): `https://api.notify.elvatech.in` — set `ELVA_NOTIFY_API_BASE` to override. Legacy alias: `ELVA_NOTIFY_BASE_URL`.

| Variable | Required when | Description |
|----------|----------------|-------------|
| `NOTIFICATION_PROVIDER` | Always | `log` (dev/test) or `elva_notify` (production email) |
| `ELVA_NOTIFY_APP_ID` | `elva_notify` | Application id (JSON body) |
| `ELVA_NOTIFY_API_KEY` | `elva_notify` | API key (JSON body, never commit) |
| `ELVA_NOTIFY_BRAND_ID` | `elva_notify` | Approved brand (required for `/notify`) |
| `ELVA_NOTIFY_TIMEOUT_MS` | Optional | HTTP timeout (default 15000) |

Production (`NODE_ENV=production`) requires `NOTIFICATION_PROVIDER=elva_notify`.

### Access requests (portal approval)

Secret access requests are **approved or rejected in the authenticated Secrets Vault portal**. ELVA Notify is used only for **transactional email** (`POST /notify`):

- New request → resource owner and application managers (email with portal link; no secret values).
- Approved → requester notified; access grant is created immediately on approve (email failure does not roll back the grant).
- Rejected → requester notified.

Email links are informational only; approve/reject always requires an authenticated API call authorized server-side.

Notifications are queued as `NOTIFICATION_DELIVERY` jobs with retries. Duplicate enqueue is reduced via dedup keys on `correlationId`.

Authentication is always `appId` + `apiKey` + `brandId` in the JSON body for `/notify` (no Bearer header). See `backend/src/modules/notifications/elva-notify.contract.ts`.

Tests use `NOTIFICATION_PROVIDER=log` and the in-memory notification test sink (`NODE_ENV=test`).

### Email showcase (local only)

Inspect or send synthetic previews of every implemented notification template:

```bash
cd backend
npm run email-showcase -- --inventory   # table of email types
npm run email-showcase -- --render      # render-only, no delivery
npm run email-showcase -- --send        # live ELVA Notify (non-production only)
```

Live send is allowed only when `NODE_ENV` is not `production`, `NOTIFICATION_PROVIDER=elva_notify` is configured, and the hard-coded allowlisted recipient matches `arunpn866@gmail.com`. Inbox delivery is not verified by the script.

### EC2 configuration

Set variables in the host environment or a protected `.env` file readable only by the API process. Do not expose notify credentials via the frontend or `VITE_*` variables.

### Verify delivery (safe)

1. Configure `elva_notify` in a staging environment.
2. Submit an access request and confirm approvers receive email.
3. Approve in the portal and confirm the requester receives approval email.
4. Use application logs for `Notification delivered` entries (no secret values in logs).
5. Use `/api/ready` — `providers.notifications.configured` should be `true`.

## Cloudinary (encrypted file blobs)

| Variable | Required when | Description |
|----------|----------------|-------------|
| `OBJECT_STORAGE_PROVIDER` | Always | `local` (default), `cloudinary`, or `s3` |
| `CLOUDINARY_CLOUD_NAME` | `cloudinary` | Cloud name |
| `CLOUDINARY_API_KEY` | `cloudinary` | API key |
| `CLOUDINARY_API_SECRET` | `cloudinary` | API secret |

See the folder hierarchy section below for path layout.

### Folder hierarchy (application vault files)

Application-scoped encrypted blobs use:

`tenants/{tenantId}/applications/{applicationId}/environments/{environmentSlug}/files/{fileId}`

Personal vault files use:

`tenants/{tenantId}/users/{userId}/files/{fileId}`

Legacy flat keys remain readable for older uploads.

### Allowed file types (application + personal vault)

Both vaults share `vault-file-validation.ts`: extension allowlist (e.g. `.txt`, `.pdf`, `.docx`, `.env.example` via `.env.*`), explicit blocklist for executables/scripts, and filename sanitization. MIME types from the client are not used as the primary gate.

## Operational notes

- Email: set `NOTIFICATION_PROVIDER=log` only in non-production; production requires `elva_notify`.
- Cloudinary credentials are server-only; the UI uploads through the API.
- File payloads are encrypted before upload; Cloudinary stores ciphertext only.
