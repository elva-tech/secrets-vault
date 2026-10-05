# Secrets Vault by ELVA — Phase 1

Secure multi-tenant platform: Phase 1–3 (foundation, applications/environments, encrypted vault secrets and files).

## Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)

## Setup

```bash
cp .env.example .env
# Set MONGODB_URI (Atlas or mongodb://127.0.0.1:27017/secrets_vault) and SESSION_SECRET (min 32 chars)
# Optional overrides: apps/api/.env

npm install
npm run build --workspace @vault/shared
```

## Development

```bash
# Terminal 1 — API
npm run dev
```

Open **http://localhost:5173** (not port 3000). The UI proxies `/api` to the API on port 4000.

Or run separately:

```bash
npm run dev:api
npm run dev:web
```

Configure `apps/web/.env` optionally:

```env
VITE_API_PROXY_TARGET=http://127.0.0.1:4000
VITE_DEV_TENANT_HOST=elva.vault.localhost
```

Set `VAULT_BASE_DOMAIN` in API `.env` to match (e.g. `vault.localhost`).

## Tests

```bash
npm test
```

## Architecture

Modular monolith under `apps/api/src/modules/` with controller → middleware (auth, tenant, authorization) → service → repository layering.

Phase 2+ modules (`vault`, `applications`, `otp`, etc.) have reserved boundaries; only Phase 1 modules are implemented.
