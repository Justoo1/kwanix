"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { clientFetch } from "@/lib/client-api";

interface WebhookEvent {
  id: number;
  event_type: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
}

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await clientFetch<WebhookEvent[]>("admin/webhooks/failed");
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load failed webhooks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRetry(eventId: number) {
    setRetrying(eventId);
    try {
      await clientFetch(`admin/webhooks/${eventId}/retry`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset webhook event.");
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Failed Webhooks</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Paystack events that exhausted all retry attempts. Reset them to re-queue.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            Dead-letter queue
            <span className="ml-2 text-sm font-normal text-zinc-400">({events.length})</span>
          </h2>
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">Loading…</p>
        ) : events.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">
            No failed webhook events. All good!
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">ID</th>
                <th className="px-6 py-3 text-left font-medium">Event type</th>
                <th className="px-6 py-3 text-left font-medium">Attempts</th>
                <th className="px-6 py-3 text-left font-medium">Last error</th>
                <th className="px-6 py-3 text-left font-medium">Created</th>
                <th className="px-6 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4 font-mono text-zinc-500 text-xs">{ev.id}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {ev.event_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-600">{ev.attempts}</td>
                  <td className="px-6 py-4 text-zinc-500 max-w-xs truncate" title={ev.last_error ?? ""}>
                    {ev.last_error ? ev.last_error.slice(0, 80) + (ev.last_error.length > 80 ? "…" : "") : "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleString("en-GH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleRetry(ev.id)}
                      disabled={retrying === ev.id}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {retrying === ev.id ? "Resetting…" : "Retry"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
