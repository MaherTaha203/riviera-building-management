/**
 * Backend API configuration.
 *
 * The API base URL is provided at build time via the `VITE_API_URL` environment
 * variable (Vite inlines `import.meta.env.VITE_*` at build time):
 *   - Production (Vercel): set `VITE_API_URL` in the project's Environment
 *     Variables, e.g. https://riviera-api.onrender.com
 *   - Local development: create `artifacts/riviera-bms/.env.local` (see
 *     `.env.example`). If it is omitted, we fall back to a local API server so
 *     the app works out of the box.
 *
 * A missing or invalid value in a production build is treated as a hard
 * configuration error and surfaced visibly (see `renderConfigError`) instead of
 * silently calling the wrong origin.
 */

/** Default backend used in local development when `VITE_API_URL` is unset. */
export const LOCAL_DEV_API_FALLBACK = "http://localhost:8080";

export class ApiConfigError extends Error {
  readonly name = "ApiConfigError";
}

/**
 * Resolve and validate the backend API base URL.
 * @throws {ApiConfigError} when the value is missing (production) or invalid.
 */
export function resolveApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL ?? "").toString().trim();

  if (raw === "") {
    if (import.meta.env.DEV) {
      return LOCAL_DEV_API_FALLBACK;
    }
    throw new ApiConfigError(
      "VITE_API_URL is not set. The production build requires the backend API " +
        "URL to be configured as an environment variable (e.g. in the Vercel " +
        "project settings).",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ApiConfigError(`VITE_API_URL is not a valid URL: "${raw}".`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiConfigError(
      `VITE_API_URL must use http or https, received: "${raw}".`,
    );
  }

  // Strip any trailing slashes; setBaseUrl prepends paths that already begin with "/".
  return raw.replace(/\/+$/, "");
}

/**
 * Render a clear, full-page configuration error (RTL) into #root so a
 * misconfigured deployment fails loudly and visibly rather than silently.
 */
export function renderConfigError(message: string): void {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div dir="rtl" style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Cairo','Inter',sans-serif;background:#0f1b2d;color:#fff;padding:24px;">
      <div style="max-width:560px;text-align:center;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:32px;">
        <div style="font-size:40px;margin-bottom:12px;">⚙️</div>
        <h1 style="font-size:20px;font-weight:800;margin:0 0 8px;">خطأ في إعداد التطبيق</h1>
        <p style="color:#cbd5e1;margin:0 0 16px;">تعذّر تحديد عنوان خادم الـ API. يرجى ضبط متغيّر البيئة <code style="direction:ltr;display:inline-block;background:#111827;padding:2px 6px;border-radius:4px;">VITE_API_URL</code> ثم إعادة النشر.</p>
        <pre style="direction:ltr;text-align:left;background:#111827;color:#fca5a5;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;overflow:auto;">${message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</pre>
      </div>
    </div>`;
}
