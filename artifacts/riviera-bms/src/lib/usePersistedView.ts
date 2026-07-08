import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Page-scoped view-state persistence (V1.1 §15).
 *
 * Persists ONLY view state — search text, filter selections, selected tab,
 * sort order, page — so a user returning to a list page finds it exactly as
 * they left it. Transient state (dialogs, forms, selected files, validation,
 * toasts, loading) is never persisted and keeps using plain `useState`.
 *
 * Design notes:
 * - One namespaced key per page: `riviera.<page>.<slot>` (e.g.
 *   `riviera.units.filters`). Grouping every filter for a page under a single
 *   key makes the timestamp, the debounced write, and the reset atomic, and
 *   guarantees no collisions across pages.
 * - Each entry stores `{ v: <state>, t: <epoch ms> }`. Entries older than 30
 *   days are ignored and removed on read, so stale filters never linger.
 * - Writes are debounced (~300 ms) and flushed on unmount, so typing in a
 *   search box doesn't hit localStorage on every keystroke, yet nothing is
 *   lost when navigating away.
 * - `reset()` clears the UI to defaults AND removes the localStorage key.
 * - Every storage access is wrapped in try/catch, so a disabled or full
 *   store (private browsing) degrades to in-memory state with no console
 *   errors and no behavioural change.
 *
 * This is purely client-side view state — no API, database, routing, or
 * business-logic involvement.
 */

const NS = "riviera.";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEBOUNCE_MS = 300;

interface Stored<T> {
  v: T;
  t: number;
}

function readStored<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || typeof parsed.t !== "number" || parsed.v == null) return defaults;
    if (Date.now() - parsed.t > MAX_AGE_MS) {
      // Stale — drop it and fall back to defaults.
      localStorage.removeItem(key);
      return defaults;
    }
    // Merge over defaults so newly-added filter fields are populated.
    return { ...defaults, ...parsed.v };
  } catch {
    return defaults;
  }
}

export function usePersistedView<T extends object>(
  page: string,
  slot: string,
  defaults: T,
): [T, (patch: Partial<T>) => void, () => void] {
  const key = NS + page + "." + slot;
  const defaultsRef = useRef(defaults);

  const [state, setState] = useState<T>(() => readStored(key, defaultsRef.current));

  const latest = useRef(state);
  latest.current = state;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ v: latest.current, t: Date.now() }));
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  }, [key]);

  const set = useCallback(
    (patch: Partial<T>) => {
      setState(prev => {
        const next = { ...prev, ...patch };
        latest.current = next;
        return next;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  const reset = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    latest.current = defaultsRef.current;
    setState(defaultsRef.current);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  // Flush a pending debounced write on unmount so navigating away mid-type
  // still persists the latest value. Nothing pending → nothing written.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        flush();
      }
    },
    [flush],
  );

  return [state, set, reset];
}
