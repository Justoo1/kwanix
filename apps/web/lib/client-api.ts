/**
 * Client-side fetch wrapper that routes requests through the Next.js proxy.
 * The proxy reads the HttpOnly session cookie server-side and injects
 * the Bearer token before forwarding to the FastAPI backend.
 *
 * Usage:  clientFetch<StationResponse[]>("stations")
 *         clientFetch<void>("stations", { method: "POST", body: JSON.stringify(payload) })
 */

const PROXY_BASE = "/api/proxy";

export async function clientFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${PROXY_BASE}/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json?.detail ?? text;
    } catch {
      message = text;
    }
    throw new Error(message || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}
