# Secrets Vault by ELVA

Multi-tenant secrets platform. Deploy **backend** and **frontend** separately.

## Layout

| Folder | Deploy to | Purpose |
|--------|-----------|---------|
| `backend/` | [Render](https://render.com) (Web Service, root dir `backend`) | Express API + MongoDB |
| `frontend/` | [Vercel](https://vercel.com) (root dir `frontend`) | React UI |

Repo root only holds shared docs, optional local `.env`, and `npm run dev` helpers.

## Local development

```bash
# Optional: copy env for backend
cp backend/.env.example backend/.env
# Or keep a single repo-root .env (backend loads repo root then backend/.env)

npm install          # root dev tools (concurrently)
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

npm run dev          # API :4000 + Vite :5173
```

Open **tenant/platform hostnames**, not bare `localhost` — e.g. `http://elva.vault.localhost:5173` or `http://vault.localhost:5173`.

## Production

**Render (backend):** Connect repo, set **Root Directory** to `backend`, build `npm install && npm run build`, start `npm start`. See `backend/render.yaml` and `backend/.env.example`.

**Vercel (frontend):** Root Directory `frontend`. Set `VITE_API_BASE_URL` to your Render API URL. Set backend `WEB_ORIGIN` to your Vercel URL.

**DNS:** `VAULT_BASE_DOMAIN` + `*.{VAULT_BASE_DOMAIN}` → frontend (and API if same host) per your architecture; tenant context is resolved from hostname.

## Tests

```bash
npm run test
```
