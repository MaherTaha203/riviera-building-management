// ---------------------------------------------------------------------------
// Frontend diagnostics (DIAGNOSTICS RELEASE — measures, never optimizes).
//
// Gated behind ONE feature flag so it is fully removable and zero-overhead
// when off. Enable either at build time or at runtime in any environment:
//
//     VITE_DIAG_PERF=1                         (build-time env)
//     localStorage.setItem("diag", "1")        (runtime, no rebuild) then reload
//
// Uses only the standard Performance API (performance.mark / getEntries) — no
// external dependencies, no telemetry, no polling. Marks the real login →
// interactive journey and cross-references the server's `Server-Timing` header
// (exposed via PerformanceResourceTiming.serverTiming) so each millisecond can
// be attributed to network vs server vs database vs frontend.
// ---------------------------------------------------------------------------

function flagOn(): boolean {
  try {
    if (import.meta.env.VITE_DIAG_PERF === "1") return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem("diag") === "1") return true;
  } catch {
    /* localStorage may be unavailable — treat as off */
  }
  return false;
}

export const DIAG = flagOn();

const PREFIX = "rv:";
const seen = new Set<string>();

/** Place a one-shot performance mark. No-op when disabled or already marked. */
export function pmark(name: string): void {
  if (!DIAG) return;
  const key = PREFIX + name;
  if (seen.has(key)) return;
  seen.add(key);
  try {
    performance.mark(key);
  } catch {
    /* ignore */
  }
}

function at(name: string): number | null {
  const e = performance.getEntriesByName(PREFIX + name, "mark")[0];
  return e ? +e.startTime.toFixed(1) : null;
}

function seg(from: string, to: string): number | null {
  const a = at(from);
  const b = at(to);
  return a != null && b != null ? +(b - a).toFixed(1) : null;
}

interface ServerTimingEntry {
  name: string;
  duration: number;
  description: string;
}

/** Pull the Server-Timing breakdown the API attached to each /api response. */
function apiResourceTimings(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
    if (!e.name.includes("/api/")) continue;
    const st = (e as unknown as { serverTiming?: ServerTimingEntry[] }).serverTiming ?? [];
    const server: Record<string, number> = {};
    for (const s of st) server[s.name] = +s.duration.toFixed(1);
    out.push({
      endpoint: e.name.split("/api/")[1]?.split("?")[0] ?? e.name,
      "total(ms)": +e.duration.toFixed(1),
      "ttfb(ms)": +(e.responseStart - e.requestStart).toFixed(1),
      "server total": server.total ?? "—",
      "server db": server.db ?? "—",
      "new conn": server.dbconnect != null ? "yes" : "",
    });
  }
  return out;
}

let reported = false;
/**
 * Build the login → interactive timeline and print a compact report. Runs once.
 * Always exposed on `window.__rivieraPerf()` for on-demand use in production;
 * auto-prints in dev. All numbers are milliseconds from navigation start.
 */
export function perfReport(): void {
  if (!DIAG) return;

  const timeline: Array<Record<string, unknown>> = [];
  const push = (phase: string, from: string, to: string) => {
    const d = seg(from, to);
    if (d != null) timeline.push({ phase, "ms": d });
  };
  push("① click → request", "login:click", "login:request");
  push("② login round-trip (net+server)", "login:request", "login:response");
  push("③ response → token stored", "login:response", "login:tokenStored");
  push("④ token → redirect", "login:tokenStored", "login:redirect");
  push("⑤ redirect → dashboard mounted", "login:redirect", "dash:mounted");
  // The header lives in the persistent shell and can become ready before the
  // lazy dashboard chunk mounts, so anchor it to redirect (not to mounted).
  push("⑥ redirect → header ready", "login:redirect", "dash:header");
  push("⑦ mounted → KPI cards ready", "dash:mounted", "dash:kpis");
  push("⑧ mounted → notifications ready", "dash:mounted", "dash:notifications");
  push("⑨ mounted → charts ready", "dash:mounted", "dash:charts");
  push("⑩ mounted → recent activity ready", "dash:mounted", "dash:activity");
  push("⑪ mounted → INTERACTIVE", "dash:mounted", "dash:interactive");

  const grand = seg("login:click", "dash:interactive");

  const data = {
    timeline,
    grandTotalMs: grand,
    api: apiResourceTimings(),
  };
  (window as unknown as { __rivieraPerf?: () => unknown }).__rivieraPerf = () => data;

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.group("%c⏱ Riviera perf — login → interactive", "color:#C6A15B;font-weight:700");
    // eslint-disable-next-line no-console
    console.table(timeline);
    // eslint-disable-next-line no-console
    console.log("Grand total (click → interactive):", grand, "ms");
    // eslint-disable-next-line no-console
    console.table(apiResourceTimings());
    // eslint-disable-next-line no-console
    console.log("Call window.__rivieraPerf() any time for the raw object.");
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
}

/** Mark 'interactive' and emit the report once, on the next idle tick. */
export function pmarkInteractive(): void {
  if (!DIAG || reported) return;
  reported = true;
  pmark("dash:interactive");
  const run = () => perfReport();
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 500 });
  else setTimeout(run, 0);
}
