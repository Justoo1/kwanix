"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertCircle, Webhook } from "lucide-react";
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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground">Failed Webhooks</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Paystack events that exhausted all retry attempts. Reset them to re-queue.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-[12px] font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-foreground">Dead-letter Queue</h2>
          <span className="text-[12px] text-muted-foreground">{events.length} events</span>
        </div>

        {loading ? (
          <p className="px-5 py-10 text-[13px] text-muted-foreground text-center">Loading…</p>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-2xl p-4 bg-primary/10 mb-4">
              <Webhook className="h-8 w-8 text-primary" />
            </div>
            <p className="text-[14px] font-semibold text-foreground/70">No failed webhook events</p>
            <p className="text-[12px] text-muted-foreground mt-1">All Paystack events processed successfully.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30">
                {["ID", "Event Type", "Attempts", "Last Error", "Created", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-[12px] text-muted-foreground">{ev.id}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {ev.event_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[13px] font-bold ${ev.attempts >= 3 ? "text-red-600" : "text-muted-foreground"}`}>
                      {ev.attempts}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-muted-foreground max-w-xs truncate" title={ev.last_error ?? ""}>
                    {ev.last_error ? ev.last_error.slice(0, 80) + (ev.last_error.length > 80 ? "…" : "") : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-muted-foreground whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleString("en-GH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => handleRetry(ev.id)}
                      disabled={retrying === ev.id}
                      className="text-[12px] font-semibold text-primary hover:opacity-70 disabled:opacity-40 transition-opacity"
                    >
                      {retrying === ev.id ? "Resetting…" : "Retry →"}
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
