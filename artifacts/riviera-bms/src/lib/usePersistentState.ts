import { useCallback, useState } from "react";

/**
 * Table/list view-state persistence (V1.1 §15).
 *
 * A drop-in replacement for `useState` that mirrors the value into
 * `localStorage`, so a page's search text and filter selections survive
 * navigating away and back (and full page reloads). Purely client-side —
 * no API, database, or business-logic involvement. Only view state
 * (search / filters) is persisted; transient dialog, form, and editing
 * state keeps using plain `useState` and resets as before.
 *
 * The signature matches `useState` exactly, so adopting it on a page is a
 * one-line swap per filter field. Reads are lazy (initializer runs once);
 * writes are wrapped in try/catch so a disabled or quota-full storage
 * (e.g. private browsing) degrades gracefully to in-memory state.
 */
const NS = "riviera:view:";

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = NS + key;

  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* storage unavailable or malformed — fall back to initial */
    }
    return initial;
  });

  const set = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState(prev => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore write failures — keep in-memory state consistent */
        }
        return next;
      });
    },
    [storageKey],
  );

  return [state, set];
}
