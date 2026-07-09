// ---------------------------------------------------------------------------
// Diagnostics-only instrumentation (DIAGNOSTICS RELEASE — measures, never
// optimizes). Everything here is gated behind ONE feature flag:
//
//     DIAG_PERF=1            (server environment variable)
//
// When the flag is off, every export is a cheap no-op and NOTHING is patched,
// so there is zero measurable overhead and the whole module can be deleted in
// one step later. No external dependencies, no telemetry, no polling.
//
// What it captures per API request (via AsyncLocalStorage so it is request-
// scoped and safe under concurrency):
//   • total request time
//   • DB: pool wait + query execution time, query count, first/last query,
//     and whether a NEW physical connection had to be opened (Neon/pool cold
//     connect)
//   • serialization time (JSON.stringify of the response body)
//   • named phase marks placed inside handlers (auth, dashboard, …)
//
// It surfaces the numbers two ways, both requested by the diagnostics brief:
//   • a `Server-Timing` response header (readable in the browser Network tab
//     and via the Performance API on the frontend)
//   • a compact one-line pino log per request (readable in Render logs)
// ---------------------------------------------------------------------------
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { logger } from "./logger";

// Accept the common truthy spellings so `DIAG_PERF=true` (or 1/yes/on) all
// activate diagnostics; anything else — including unset — keeps them OFF.
export const DIAG = /^(1|true|yes|on)$/i.test((process.env.DIAG_PERF ?? "").trim());

interface DiagCtx {
  path: string;
  method: string;
  t0: number;
  queryCount: number;
  dbMs: number; // summed wall time of queries (pool wait + execution)
  firstQueryAt: number | null; // ms from request start to first query issued
  lastQueryEnd: number | null; // ms from request start to last query resolved
  newConnections: number; // physical connections opened during this request
  serializeMs: number;
  marks: Record<string, number>; // handler phase marks, ms from request start
}

const als = new AsyncLocalStorage<DiagCtx>();

/** Place a named server-side phase mark inside a handler. No-op when disabled. */
export function smark(name: string): void {
  if (!DIAG) return;
  const ctx = als.getStore();
  if (ctx) ctx.marks[name] = +(performance.now() - ctx.t0).toFixed(2);
}

let patched = false;
/**
 * Patch the shared pg Pool once so every query run within a diagnostics
 * request records its timing. `pool.on("connect")` fires ONLY when a brand-new
 * backend connection is established (not on pool reuse) — that is our Neon /
 * pool cold-connect signal.
 */
export function instrumentPool(): void {
  if (!DIAG || patched) return;
  patched = true;

  pool.on("connect", () => {
    const ctx = als.getStore();
    if (ctx) ctx.newConnections++;
  });

  const original = pool.query.bind(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = function instrumented(...args: any[]) {
    const ctx = als.getStore();
    if (!ctx) return (original as any)(...args);
    const start = performance.now();
    if (ctx.firstQueryAt === null) ctx.firstQueryAt = +(start - ctx.t0).toFixed(2);
    const done = () => {
      const end = performance.now();
      ctx.queryCount++;
      ctx.dbMs += end - start;
      ctx.lastQueryEnd = +(end - ctx.t0).toFixed(2);
    };
    let res: unknown;
    try {
      res = (original as any)(...args);
    } catch (e) {
      done();
      throw e;
    }
    if (res && typeof (res as Promise<unknown>).then === "function") {
      (res as Promise<unknown>).then(done, done);
    } else {
      done();
    }
    return res;
  };
}

function buildServerTiming(ctx: DiagCtx): string {
  const total = performance.now() - ctx.t0;
  const parts = [
    `total;dur=${total.toFixed(1)}`,
    `db;dur=${ctx.dbMs.toFixed(1)};desc="${ctx.queryCount}q"`,
  ];
  if (ctx.firstQueryAt != null) parts.push(`dbfirst;dur=${ctx.firstQueryAt}`);
  if (ctx.lastQueryEnd != null) parts.push(`dblast;dur=${ctx.lastQueryEnd}`);
  if (ctx.newConnections > 0) parts.push(`dbconnect;dur=0;desc="${ctx.newConnections}-new-conn"`);
  if (ctx.serializeMs > 0) parts.push(`serialize;dur=${ctx.serializeMs.toFixed(2)}`);
  for (const [k, v] of Object.entries(ctx.marks)) parts.push(`${k};dur=${v}`);
  return parts.join(", ");
}

/**
 * Request middleware: opens the diagnostics context, times serialization,
 * writes the `Server-Timing` header just before the body, and logs a compact
 * summary on finish. No-op passthrough when the flag is off.
 */
export function diagMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!DIAG) return next();

  const ctx: DiagCtx = {
    path: (req.originalUrl || req.url).split("?")[0],
    method: req.method,
    t0: performance.now(),
    queryCount: 0,
    dbMs: 0,
    firstQueryAt: null,
    lastQueryEnd: null,
    newConnections: 0,
    serializeMs: 0,
    marks: {},
  };

  // Let cross-origin readers (the Vercel frontend) see Server-Timing AND the
  // detailed resource timing via PerformanceResourceTiming — both require
  // Timing-Allow-Origin for cross-origin responses.
  res.setHeader("Timing-Allow-Origin", "*");

  als.run(ctx, () => {
    const originalJson = res.json.bind(res);
    // Measure serialization exactly once and send the pre-stringified body,
    // so we don't double-encode. Behaviour (status, body) is unchanged.
    res.json = (body: unknown) => {
      if (!res.headersSent) {
        const s = performance.now();
        const str = JSON.stringify(body);
        ctx.serializeMs = performance.now() - s;
        res.setHeader("Server-Timing", buildServerTiming(ctx));
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.send(str);
      }
      return originalJson(body);
    };

    const sendStart = () => performance.now();
    let writeStart = 0;
    res.on("finish", () => {
      const total = performance.now() - ctx.t0;
      logger.info(
        {
          diag: {
            m: ctx.method,
            path: ctx.path,
            status: res.statusCode,
            totalMs: +total.toFixed(1),
            dbMs: +ctx.dbMs.toFixed(1),
            queries: ctx.queryCount,
            newConn: ctx.newConnections,
            dbFirstAt: ctx.firstQueryAt,
            dbLastAt: ctx.lastQueryEnd,
            serializeMs: +ctx.serializeMs.toFixed(2),
            ...ctx.marks,
          },
        },
        "perf",
      );
      void writeStart;
      void sendStart;
    });

    next();
  });
}

/**
 * One-shot boot probe: time the very first DB round-trip after the pool is
 * created. On a cold Neon compute this is the wake-up cost; on a warm one it
 * is a few ms. Logged so it appears in Render boot logs. No-op when disabled.
 */
export async function logBootDbConnect(): Promise<void> {
  if (!DIAG) return;
  const s = performance.now();
  try {
    await pool.query("select 1");
    logger.info(
      { diag: { bootDbFirstConnectMs: +(performance.now() - s).toFixed(1) } },
      "perf-boot",
    );
  } catch {
    /* connection errors are handled by the schema guard; don't mask them here */
  }
}
