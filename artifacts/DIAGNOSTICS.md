# Diagnostics Release — Performance Instrumentation

**This release only measures. It changes no business logic, no APIs, no schema,
no React Query config, and does not optimize anything.** Everything is gated
behind a single feature flag and is deleted in one step when we're done.

---

## 1. Enabling / disabling (the single flag)

| Tier | Turn ON | Turn OFF (default) |
|------|---------|--------------------|
| **Server** (Render) | env var `DIAG_PERF=1` | unset the env var |
| **Frontend** | `localStorage.setItem("diag","1")` then reload — *or* build with `VITE_DIAG_PERF=1` | `localStorage.removeItem("diag")` |

When OFF: no header is added, no log line is emitted, the pg pool is **not**
patched, and the frontend marks are no-ops — i.e. **zero measurable overhead**.

To remove the feature entirely later: delete `api-server/src/lib/diag.ts` and
`riviera-bms/src/lib/perf.ts`, then drop their (clearly commented) call sites.

---

## 2. What gets measured, and where to read it

### A. `Server-Timing` response header (read in the browser Network tab)
Every `/api` response carries, e.g.:

```
Server-Timing: total;dur=175.1, db;dur=100.7;desc="1q", dbfirst;dur=3.3,
  dblast;dur=104.0, dbconnect;dur=0;desc="1-new-conn", serialize;dur=0.55,
  login_received;dur=1.4, user_lookup;dur=104.3, bcrypt;dur=172.6, jwt_sign;dur=174.5
```

| token | meaning |
|-------|---------|
| `total` | full handler time (ms) |
| `db` + `desc="Nq"` | summed query wall-time and **query count** |
| `dbfirst` / `dblast` | when the first/last query ran, from request start |
| `dbconnect desc="N-new-conn"` | **a new physical DB connection was opened** — the Neon/pool cold-connect signal |
| `serialize` | JSON.stringify time |
| named marks | in-handler phases (`bcrypt`, `summary_computed`, …) |

`Timing-Allow-Origin: *` is sent so the Vercel frontend can read this
cross-origin via `PerformanceResourceTiming.serverTiming`.

### B. Render logs (production, one compact line per request)
`msg:"perf"` with `{ totalMs, dbMs, queries, newConn, dbFirstAt, dbLastAt, serializeMs, <marks> }`.
Plus once at boot: `msg:"perf-boot"` → `bootDbFirstConnectMs` (first DB round-trip after the pool is created).

### C. Frontend timeline (browser console + `window.__rivieraPerf()`)
Standard `performance.mark` covering the real journey:

```
login:click → login:request → login:response → login:tokenStored → login:redirect
→ dash:mounted → dash:header → dash:kpis → dash:charts → dash:activity → dash:interactive
```

Auto-prints a table in dev; in production call **`window.__rivieraPerf()`** in the
console to get the timeline + per-API server-timing object.

---

## 3. Attributing every millisecond

| Cost category | Where to read it |
|---------------|------------------|
| **Frontend (JS/render/route)** | timeline segment `redirect → dashboard mounted` (lazy chunk + route) and `mounted → interactive`. This is CPU + bundle work. |
| **Network (round-trip)** | per-API `ttfb − server.total` (browser resource timing minus the server's own `total`). |
| **Server CPU** | `total − db − serialize` on each request (e.g. `bcrypt` for login). |
| **Database (warm)** | `db` with `desc="Nq"` — and whether N sequential queries dominate (see `dashboard/summary`, 12 queries). |
| **Render cold start** | first request after idle: `perf-boot` appears (process just booted) **and** the client sees a multi-second TTFB on a request whose server `total` is small. |
| **Neon cold start** | first request after idle carries `dbconnect desc="…-new-conn"` **and** its `db`/`dbfirst` is far larger than the warm baseline (warm: `db` a few ms; cold: hundreds of ms–seconds). |

### The warm-vs-cold tell (measured locally, same mechanism in prod)
```
login  #1 (cold pool): totalMs 177, newConn 1, dbMs 100, bcrypt 172
login  #2 (warm pool): totalMs  85, newConn 0, dbMs   6, bcrypt  84
summary #1 (cold):     totalMs 292, dbMs 286  (12 sequential queries)
summary #2..4 (warm):  totalMs 8-11, dbMs 6-9
```
The gap between the first hit and the warm baseline **is** the cold-start cost,
split by tier: `newConn` / large `db` → Neon/pool; small server `total` but huge
client TTFB → Render process wake.

---

## 4. How to capture the real production numbers

1. Set `DIAG_PERF=1` in Render and redeploy; enable `localStorage.diag=1` in your browser.
2. Leave the app idle ≥1 hour (Render idles ~15 min, Neon ~5 min).
3. Log in. Then:
   - **Render logs** → read the `perf-boot` line and the first few `perf` lines.
   - **Browser Network tab** → click the `login` and `dashboard/summary` requests → *Timing* → *Server Timing*.
   - **Console** → `window.__rivieraPerf()` for the login→interactive timeline.
4. Log in again immediately → that's the warm baseline. The difference is the cold start, now split across Render vs Neon vs bcrypt vs frontend.

No optimization is applied in this release — these numbers decide what (if
anything) we change next.
