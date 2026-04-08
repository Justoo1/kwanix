/**
 * Client-side fetch wrapper that routes requests through the Next.js proxy.
 * The proxy reads the HttpOnly session cookie server-side and injects
 * the Bearer token before forwarding to the FastAPI backend.
 *
 * On 401, attempts one token refresh (via /api/auth/refresh) then retries
 * the original request. If the retry also fails, redirects to /login.
 *
 * Usage:  clientFetch<StationResponse[]>("stations")
 *         clientFetch<void>("stations", { method: "POST", body: JSON.stringify(payload) })
 */

const PROXY_BASE = "/api/proxy";

function parseErrorMessage(text: string): string {
  try {
    const json = JSON.parse(text);
    const detail = json?.detail;
    // FastAPI structured errors (e.g. DESTINATION_MISMATCH) send detail as
    // an object, not a string. Preserve it as JSON so callers can parse it.
    return detail === undefined
      ? text
      : typeof detail === "string"
      ? detail
      : JSON.stringify(detail);
  } catch {
    return text;
  }
}

export async function clientFetch<T>(
  path: string,
  init?: RequestInit,
  _retried = false
): Promise<T> {
  const mergedInit: RequestInit = {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  };

  const res = await fetch(`${PROXY_BASE}/${path}`, mergedInit);

  if (res.status === 401 && !_retried) {
    // Attempt one silent token refresh
    const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });
    if (refreshRes.ok) {
      // Retry original request with updated session cookie (proxy re-reads it)
      return clientFetch<T>(path, init, true);
    }
    // Refresh failed — session is fully expired, send to login
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(parseErrorMessage(text) || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}
