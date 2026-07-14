// ---------------------------------------------------------------------------
// Automatic exchange rates (USD→ILS, JOD→ILS) for the header FX chips and the
// voucher/cheque rate prefills.
//
// The DB `exchange_rates` row remains the MANUAL fallback / last-known-good
// value (still editable in Settings). This module fetches LIVE rates from a
// free, no-key FX endpoint on a schedule and caches them in memory. The
// settings endpoint serves the live rate when it is available and falls back
// to the stored manual rate whenever the fetch fails or is disabled — so a
// blocked egress or a flaky API never breaks the app, it just shows the last
// manual value.
//
// Fully reversible / configurable via environment:
//   FX_AUTO=0            → disable auto-fetch entirely (pure manual, old behaviour)
//   FX_REFRESH_MS=<ms>   → override the cache TTL (default 24h)
//   FX_SOURCE_URL=<url>  → override the upstream (default open.er-api.com, base USD)
// ---------------------------------------------------------------------------
import { logger } from "./logger";

// Auto-fetch is ON unless explicitly disabled with a falsy spelling.
export const FX_AUTO = !/^(0|false|no|off)$/i.test((process.env.FX_AUTO ?? "").trim());

// Rates against the shekel move slowly; a daily refresh is plenty and keeps the
// number of outbound calls trivial. Override with FX_REFRESH_MS if needed.
const TTL_MS = Number(process.env.FX_REFRESH_MS) > 0 ? Number(process.env.FX_REFRESH_MS) : 24 * 60 * 60 * 1000;

// Free, no-key, CORS-enabled, daily-updated. Base USD so `rates.ILS` is exactly
// usdToILS and `rates.JOD` is JOD-per-USD (used to derive jodToILS).
const SOURCE_URL = process.env.FX_SOURCE_URL || "https://open.er-api.com/v6/latest/USD";

const FETCH_TIMEOUT_MS = 8000;

export interface LiveRates {
  usdToILS: number;
  jodToILS: number;
  fetchedAt: Date;
}

let cache: LiveRates | null = null;
let inFlight: Promise<LiveRates | null> | null = null;

/**
 * Pure transform: turn an open.er-api.com "base USD" payload into our two
 * ILS-denominated rates. Exported for testing without the network.
 *   usdToILS = ILS per 1 USD                     = rates.ILS
 *   jodToILS = ILS per 1 JOD = (ILS/USD)/(JOD/USD) = rates.ILS / rates.JOD
 * Returns null if the payload is missing fields or the numbers are not sane.
 */
export function computeRatesFromApi(json: unknown): { usdToILS: number; jodToILS: number } | null {
  const rates = (json as { rates?: Record<string, unknown> } | null)?.rates;
  if (!rates) return null;
  const ilsPerUsd = Number(rates.ILS);
  const jodPerUsd = Number(rates.JOD);
  if (!Number.isFinite(ilsPerUsd) || !Number.isFinite(jodPerUsd) || jodPerUsd <= 0) return null;
  const usdToILS = ilsPerUsd;
  const jodToILS = ilsPerUsd / jodPerUsd;
  // Guard against a garbage upstream response corrupting financial prefills.
  if (!sane(usdToILS) || !sane(jodToILS)) return null;
  return { usdToILS: round4(usdToILS), jodToILS: round4(jodToILS) };
}

function sane(n: number): boolean {
  // Very loose bounds — just enough to reject 0, negatives, nulls, and absurd values.
  return Number.isFinite(n) && n > 0.1 && n < 100;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

async function fetchLive(): Promise<LiveRates | null> {
  try {
    const resp = await fetch(SOURCE_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!resp.ok) {
      logger.warn({ fx: { status: resp.status } }, "fx: upstream returned non-OK");
      return null;
    }
    const parsed = computeRatesFromApi(await resp.json());
    if (!parsed) {
      logger.warn("fx: upstream payload missing/insane rates");
      return null;
    }
    const live: LiveRates = { ...parsed, fetchedAt: new Date() };
    logger.info({ fx: { usdToILS: live.usdToILS, jodToILS: live.jodToILS } }, "fx: live rates refreshed");
    return live;
  } catch (err) {
    logger.warn({ fx: { err: (err as Error)?.message } }, "fx: live fetch failed");
    return null;
  }
}

/**
 * Return live rates if auto-fetch is enabled and a fresh (or freshly fetchable)
 * value exists; otherwise null so the caller falls back to the stored manual
 * rate. Never throws. De-dupes concurrent refreshes via a single in-flight
 * promise and keeps serving the stale cache if a refresh fails.
 */
export async function getLiveRates(): Promise<LiveRates | null> {
  if (!FX_AUTO) return null;
  const fresh = cache && Date.now() - cache.fetchedAt.getTime() < TTL_MS;
  if (fresh) return cache;
  if (!inFlight) {
    inFlight = fetchLive().finally(() => { inFlight = null; });
  }
  const result = await inFlight;
  if (result) cache = result;
  // On failure, serve the last good cache if we have one, else null (→ fallback).
  return cache;
}
