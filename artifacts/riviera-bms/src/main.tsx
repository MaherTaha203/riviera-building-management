import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getToken } from "./lib/auth";
import App from "./App";
import "./index.css";

// API base URL is configured via the VITE_API_URL build-time environment
// variable (set in the hosting provider, e.g. Vercel). In development we fall
// back to the local API server. In production the variable is required — if it
// is missing we fail clearly instead of silently issuing requests to the wrong
// origin.
const DEV_API_FALLBACK = "http://localhost:8080";
const apiUrl = (import.meta.env.VITE_API_URL ?? "").trim();

function renderConfigError(message: string): void {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div dir="rtl" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#0a0a0a;color:#fafafa">
        <div style="max-width:520px;text-align:center">
          <h1 style="font-size:20px;font-weight:700;margin-bottom:12px">خطأ في الإعداد</h1>
          <p style="color:#a1a1aa;line-height:1.7">${message}</p>
        </div>
      </div>`;
  }
}

if (!apiUrl) {
  if (import.meta.env.PROD) {
    const msg =
      "متغير البيئة VITE_API_URL غير مُعرَّف. يجب ضبط عنوان واجهة برمجة التطبيقات (API) في إعدادات الاستضافة قبل تشغيل التطبيق.";
    renderConfigError(msg);
    throw new Error(
      "VITE_API_URL is not configured. Set the API base URL environment variable in the hosting provider before building/deploying.",
    );
  }
  // Development convenience: fall back to the local API server.
  setBaseUrl(DEV_API_FALLBACK);
} else {
  setBaseUrl(apiUrl);
}

setAuthTokenGetter(getToken);

createRoot(document.getElementById("root")!).render(<App />);
