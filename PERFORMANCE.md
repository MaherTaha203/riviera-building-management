# Performance — baseline, budget, and monitoring

This is the long-term guard rail (Phase 5) for the performance work delivered in
Phases 0–3. It records the baseline, the enforced budget, and how to keep an eye
on production over time. For the request-level instrumentation itself, see
[`artifacts/DIAGNOSTICS.md`](artifacts/DIAGNOSTICS.md).

## Baseline (measured in production)

| Metric | Before | After Phases 0–3 |
| --- | --- | --- |
| First login after idle | ~37 s (Render cold start) | ~1 s (kept warm) |
| Login server time | 620 ms (99% bcrypt, `bcryptjs`) | native bcrypt (~4–6× faster CPU-bound) |
| Dashboard summary | 12 sequential DB queries | 7 parallel conditional-aggregation queries |
| Dashboard "latest 5 receipts" | ~620 KB full-list fetch | ~0.7 KB dedicated endpoint (−99.9%) |
| Duplicate list requests / navigation | many (staleTime 0) | de-duplicated (30 s staleTime + financial invalidation) |
| Dashboard first paint | full-page spinner until summary | shell-first + per-widget skeletons |

The dominant cost was a **Render container cold start (~36.5 s)** — infrastructure,
not code. Phase 0 (keep-warm) removed it at $0. Everything else improved the warm
path and perceived speed.

## Budget (enforced in CI)

`scripts/perf-budget.mjs` runs in CI after the build and fails the run if the
frontend bundle regresses past budget — protecting the route-splitting and
vendor-chunking wins. Current budgets (raw bytes):

| Category | Budget | Typical |
| --- | --- | --- |
| entry (`index-*.js`) | 100 KB | ~66 KB |
| each vendor chunk | 230 KB | ~181 KB max |
| each route chunk | 60 KB | ~15 KB max |
| total `.js` | 950 KB | ~700 KB |

When a change legitimately grows a bundle, raise the matching budget in
`scripts/perf-budget.mjs` **in the same PR** — that keeps the budget an explicit,
reviewed decision rather than silent drift.

## Monitoring

### 1. Keep-warm latency (synthetic TTFB monitor)
`.github/workflows/keep-warm.yml` pings `/api/healthz` every ~10 min and records
the status + TTFB to each run's summary. A warm, DB-free `/healthz` answers in
well under a second; **if TTFB exceeds 5 s the workflow emits a warning** — the
signal that the schedule slipped and a user could have hit a cold start. Watch
the Actions tab for those warnings; repeated ones mean the free keep-warm is
unreliable and it's time to consider the escalation below.

### 2. Request-level timing (on demand)
Enable the diagnostics flag (`DIAG_PERF=true` on the server) to get `Server-Timing`
headers, per-request `perf` logs in Render, a `perf-boot` DB-connect probe, and the
frontend `window.__rivieraPerf()` login→interactive timeline. Full guide in
`artifacts/DIAGNOSTICS.md`. Keep it **off by default**; turn it on for a
measurement window, then off.

### 3. Verifying native bcrypt is active
On boot, Render logs one of:
- `Password hashing: native @node-rs/bcrypt` — the fast path is active.
- `Native @node-rs/bcrypt unavailable — using bcryptjs fallback` — login still
  works, but at the slower pure-JS speed; investigate the platform binary.

## Infrastructure decision (Phase 4) — gated on the numbers

Phase 4 is a **decision, not a default**. Stay on the free keep-warm setup unless
the production numbers say otherwise. Escalate to an always-on tier (e.g. Render
Starter, which also gives a CPU boost for bcrypt) only if:

1. the keep-warm TTFB monitor repeatedly warns (schedule slips), or
2. the free monthly-hours cap is exceeded, or
3. deploy-time cold starts become a problem, or
4. production bcrypt is still slow after the native switch.

Migrating off Render (Fly/Railway) is only warranted if you specifically want to
leave the platform. Serverless is a re-architecture not justified at this scale.
