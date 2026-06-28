# Riviera Building Management — Web Frontend

React + Vite + TanStack Query frontend (Arabic RTL) for the Riviera Building
Management System.

## Configuration

The frontend talks to the backend API through a single configurable base URL.
There are **no hardcoded backend URLs** in the source — the URL comes from the
`VITE_API_URL` environment variable, resolved and validated in
[`src/lib/config.ts`](./src/lib/config.ts).

| Variable       | Required           | Example                              | Notes |
| -------------- | ------------------ | ------------------------------------ | ----- |
| `VITE_API_URL` | Yes in production  | `https://riviera-api.onrender.com`   | Backend API base URL, no trailing slash. `http`/`https` only. Inlined at build time. |

> Vite only exposes variables prefixed with `VITE_` to the browser, and inlines
> them at **build time** — so `VITE_API_URL` must be set **before** `vite build`,
> not at runtime.

### Behaviour

- **Set & valid** → used as the API base URL.
- **Unset in development** (`vite dev` / `import.meta.env.DEV`) → falls back to
  `http://localhost:8080` (the local `api-server` default) so the app runs out
  of the box.
- **Unset in a production build** → the app shows a clear, full-page
  configuration error (Arabic) and does **not** mount, instead of silently
  calling the wrong origin.
- **Invalid** (not a URL, or a non-http(s) protocol) → same visible error.

## Development environment

```bash
# 1. From the repo root, start the backend API (port 8080):
pnpm --filter @workspace/api-server run dev

# 2. Configure the frontend (optional in dev — defaults to http://localhost:8080):
cp artifacts/riviera-bms/.env.example artifacts/riviera-bms/.env.local
#   edit VITE_API_URL if your API runs elsewhere

# 3. Start the frontend dev server:
pnpm --filter @workspace/riviera-bms run dev
```

Local `.env*` files are git-ignored (only `.env.example` is committed).

## Production environment (Vercel)

1. In the Vercel project → **Settings → Environment Variables**, add:
   - **Key:** `VITE_API_URL`
   - **Value:** the deployed backend URL, e.g. `https://riviera-api.onrender.com`
   - **Environments:** Production (and Preview, if previews should hit a backend).
2. Redeploy so the new value is inlined into the build.
3. The build command is `vite build`; output is `dist/public`. SPA routing is
   handled by [`vercel.json`](./vercel.json).

Because the value is build-time, **changing `VITE_API_URL` requires a redeploy**
to take effect.

### Backend (Render) and database (Neon)

- **API** is deployed on Render and is the value you put in `VITE_API_URL`.
  Required server env: `DATABASE_URL`, `SESSION_SECRET`.
- **Database** is PostgreSQL on Neon (`DATABASE_URL`).

## Build

```bash
# Local production build (provide the API URL for the build):
VITE_API_URL="https://riviera-api.onrender.com" \
  pnpm --filter @workspace/riviera-bms run build
```
