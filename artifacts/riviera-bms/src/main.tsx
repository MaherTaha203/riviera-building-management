import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getToken } from "./lib/auth";
import { resolveApiBaseUrl, renderConfigError, ApiConfigError } from "./lib/config";
import App from "./App";
import "./index.css";

function bootstrap(): void {
  let apiBaseUrl: string;
  try {
    apiBaseUrl = resolveApiBaseUrl();
  } catch (error) {
    if (error instanceof ApiConfigError) {
      // Fail loudly and visibly instead of silently calling the wrong origin.
      renderConfigError(error.message);
      return;
    }
    throw error;
  }

  setBaseUrl(apiBaseUrl);
  setAuthTokenGetter(getToken);

  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
