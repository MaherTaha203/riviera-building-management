// ---------------------------------------------------------------------------
// Smart date parsing (Track 2). Lets users TYPE a date loosely — "1/4",
// "01/04", "1.4.26", "01042026" — and press Enter to normalise it, filling in
// the current year when omitted. Day-first (dd/mm/yyyy), the regional
// convention. Pure and exhaustively testable; the component in
// components/ui/smart-date-input.tsx wraps it. Values are stored/emitted as ISO
// "yyyy-mm-dd" (unchanged from the native date inputs it replaces).
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Expand a 1–2 digit year to 20xx; leave a 4-digit year as-is. */
function expandYear(y: number, len: number): number {
  return len <= 2 ? 2000 + y : y;
}

/** Validate a (year, month, day) triple and return ISO, or null if impossible
 *  (rejects overflow like 31/02 by round-tripping through Date). */
function toIso(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || y < 1000 || y > 9999) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parse loose user input into an ISO date string, or null if it can't be made
 * into a valid date. `today` is injectable for testing.
 */
export function parseSmartDate(raw: string, today: Date = new Date()): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already ISO.
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoMatch) return toIso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  const curM = today.getMonth() + 1;
  const curY = today.getFullYear();

  // Separated forms: d, d/m, d/m/y with / . - or spaces as separators.
  const cleaned = s.replace(/[.\-\s]+/g, "/");
  if (cleaned.includes("/")) {
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length === 0 || parts.some((p) => !/^\d+$/.test(p))) return null;
    if (parts.length === 1) return toIso(curY, curM, +parts[0]);
    if (parts.length === 2) return toIso(curY, +parts[1], +parts[0]);
    if (parts.length === 3) return toIso(expandYear(+parts[2], parts[2].length), +parts[1], +parts[0]);
    return null;
  }

  // Compact digits: dd, ddmm, ddmmyy, ddmmyyyy.
  if (!/^\d+$/.test(cleaned)) return null;
  const n = cleaned;
  if (n.length <= 2) return toIso(curY, curM, +n);
  if (n.length === 4) return toIso(curY, +n.slice(2, 4), +n.slice(0, 2));
  if (n.length === 6) return toIso(expandYear(+n.slice(4, 6), 2), +n.slice(2, 4), +n.slice(0, 2));
  if (n.length === 8) return toIso(+n.slice(4, 8), +n.slice(2, 4), +n.slice(0, 2));
  return null;
}

/** ISO "yyyy-mm-dd" → display "dd/mm/yyyy" (empty string when not a valid ISO). */
export function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Local Date → ISO "yyyy-mm-dd" (for the calendar picker). */
export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
