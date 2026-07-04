import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Global keyboard shortcuts + cross-page "open the New dialog" signal.
//
// F2  → سند قبض جديد   (/receipt-vouchers)
// F3  → سند صرف جديد   (/payment-vouchers)
// F4  → مستأجر جديد     (/tenants)
// F5  → browser refresh (default behavior, untouched)
// Ctrl+P → triggers the page's primary print button ([data-print-btn])
// Ctrl+S → triggers the open dialog's save button ([data-save-btn])
// ESC → close dialog (handled natively by Radix)
// ---------------------------------------------------------------------------

const OPEN_NEW_KEY = "riviera:open-new";

/** Navigate to `path` (if needed) and ask its page to open the "add new" dialog. */
export function requestOpenNew(path: string, navigate: (p: string) => void): void {
  if (window.location.pathname === path) {
    window.dispatchEvent(new CustomEvent("riviera:new"));
  } else {
    sessionStorage.setItem(OPEN_NEW_KEY, path);
    navigate(path);
  }
}

/**
 * Pages that own an "add new" dialog call this once; `onNew` fires when the
 * page was navigated to via a shortcut, or when the shortcut is pressed while
 * the page is already open.
 */
export function useOpenNewSignal(path: string, onNew: () => void): void {
  useEffect(() => {
    if (sessionStorage.getItem(OPEN_NEW_KEY) === path) {
      sessionStorage.removeItem(OPEN_NEW_KEY);
      onNew();
    }
    const handler = () => onNew();
    window.addEventListener("riviera:new", handler);
    return () => window.removeEventListener("riviera:new", handler);
    // Intentionally mount-only: onNew closures only call state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

/** Installed once in AppLayout. */
export function useGlobalShortcuts(navigate: (p: string) => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && key.toLowerCase() === "s") {
        // Save the currently open dialog (never the browser "save page" dialog).
        e.preventDefault();
        const btn = document.querySelector<HTMLButtonElement>('[role="dialog"] [data-save-btn]');
        if (btn && !btn.disabled) btn.click();
        return;
      }
      if (mod && key.toLowerCase() === "p") {
        // Route Ctrl+P through the page's primary print button so the
        // unified print template is used instead of printing the raw screen.
        // Prefer the unified Print/Export button (approved design); fall back
        // to a legacy standalone print button if a page still has one.
        const btn = document.querySelector<HTMLButtonElement>("[data-print-export], [data-print-btn]");
        if (btn) {
          e.preventDefault();
          btn.click();
        }
        return;
      }
      // Function keys work even while typing in a field; plain shortcuts don't.
      if (key === "F2") { e.preventDefault(); requestOpenNew("/receipt-vouchers", navigate); return; }
      if (key === "F3") { e.preventDefault(); requestOpenNew("/payment-vouchers", navigate); return; }
      if (key === "F4") { e.preventDefault(); requestOpenNew("/tenants", navigate); return; }
      // F5: leave the browser's native refresh untouched.
      void isTypingTarget; // reserved for future plain-letter shortcuts
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}
