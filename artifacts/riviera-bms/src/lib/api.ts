import { getToken, clearToken } from "./auth";

const originalFetch = globalThis.fetch;

export function setupApiInterceptor() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getToken();
    const headers = new Headers(init?.headers);
    
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const modifiedInit = { ...init, headers };

    try {
      const response = await originalFetch(input, modifiedInit);
      if (response.status === 401) {
        // Only redirect if not already on login page
        if (!window.location.pathname.includes('/login')) {
            clearToken();
            window.location.href = '/login';
        }
      }
      return response;
    } catch (error) {
      throw error;
    }
  };
}
