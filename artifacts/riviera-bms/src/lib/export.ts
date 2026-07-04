// ---------------------------------------------------------------------------
// Shared table export (V1.1 §6) — one implementation reused by every page.
// Produces an Excel-compatible CSV (UTF-8 BOM so Arabic opens correctly in
// Excel) and downloads it client-side. PDF export goes through the existing
// unified print flow (Print → Save as PDF) — no duplicate mechanism.
// ---------------------------------------------------------------------------

export type ExportCell = string | number | null | undefined;

function csvEscape(v: ExportCell): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, headers: string[], rows: ExportCell[][]): void {
  const lines = [headers, ...rows].map(r => r.map(csvEscape).join(","));
  // ﻿ BOM → Excel detects UTF-8 and renders Arabic correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
