"use client";

import { useEffect, useState } from "react";
import { X, ClipboardList, Download, Bell, RefreshCw } from "lucide-react";
import { clientFetch } from "@/lib/client-api";
import type { UserRole } from "@/lib/definitions";
import type { ParcelRow } from "@/hooks/use-parcels";

const MANAGER_ROLES: UserRole[] = ["station_manager", "company_admin", "super_admin"];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  in_transit: "bg-blue-100 text-blue-800",
  arrived: "bg-purple-100 text-purple-800",
  picked_up: "bg-green-100 text-green-800",
  returned: "bg-zinc-100 text-zinc-600",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_transit: "In Transit",
  arrived: "Arrived",
  picked_up: "Picked Up",
  returned: "Returned",
};

interface LogEntry {
  id: number;
  action: string;
  actor_name: string | null;
  actor_role: string | null;
  note: string | null;
  created_at: string;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900">{value ?? <span className="text-zinc-400">—</span>}</dd>
    </div>
  );
}

export default function ParcelDetailDrawer({
  parcel,
  userRole,
  onClose,
}: {
  parcel: ParcelRow | null;
  userRole: UserRole;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fetchedFor, setFetchedFor] = useState<number | null>(null);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);
  const canViewLogs = MANAGER_ROLES.includes(userRole);

  // Derived: loading if we have a parcel whose logs haven't arrived yet
  const logsLoading = canViewLogs && parcel !== null && fetchedFor !== parcel.id;

  useEffect(() => {
    if (!parcel || !canViewLogs) return;
    let cancelled = false;
    clientFetch<LogEntry[]>(`parcels/${parcel.id}/logs`)
      .then((data) => { if (!cancelled) { setLogs(data); setFetchedFor(parcel.id); } })
      .catch(() => { if (!cancelled) { setLogs([]); setFetchedFor(parcel.id); } });
    return () => { cancelled = true; };
  }, [parcel, canViewLogs]);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${parcel ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-white shadow-xl transition-transform duration-300 ${parcel ? "translate-x-0" : "translate-x-full"}`}
      >
        {parcel && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Parcel Details</p>
                <p className="font-mono text-sm font-bold text-zinc-900">{parcel.tracking_number}</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-6 px-5 py-5">
              {/* Status */}
              <div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[parcel.status] ?? "bg-zinc-100 text-zinc-700"}`}
                >
                  {STATUS_LABELS[parcel.status] ?? parcel.status}
                </span>
              </div>

              {/* Sender / Receiver */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Parties</h3>
                <dl className="grid grid-cols-2 gap-3">
                  <Field label="Sender" value={parcel.sender_name} />
                  <Field label="Receiver" value={parcel.receiver_name} />
                  <Field label="Receiver Phone" value={parcel.receiver_phone} />
                </dl>
              </section>

              {/* Route */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Route</h3>
                <dl className="grid grid-cols-2 gap-3">
                  <Field label="Origin" value={parcel.origin_station_name ?? `Station ${parcel.origin_station_id}`} />
                  <Field label="Destination" value={parcel.destination_station_name ?? `Station ${parcel.destination_station_id}`} />
                </dl>
              </section>

              {/* Parcel info */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Parcel Info</h3>
                <dl className="grid grid-cols-2 gap-3">
                  <Field label="Weight" value={parcel.weight_kg != null ? `${parcel.weight_kg} kg` : null} />
                  <Field label="Fee" value={`GHS ${Number(parcel.fee_ghs).toFixed(2)}`} />
                  {parcel.declared_value_ghs != null && (
                    <Field label="Declared Value" value={`GHS ${Number(parcel.declared_value_ghs).toFixed(2)}`} />
                  )}
                  <Field label="Description" value={parcel.description} />
                  <Field
                    label="Logged"
                    value={
                      parcel.created_at
                        ? new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(parcel.created_at))
                        : null
                    }
                  />
                </dl>
              </section>

              {/* Status timestamps */}
              {(parcel.loaded_at || parcel.arrived_at || parcel.collected_at) && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Timeline</h3>
                  <dl className="space-y-2">
                    {parcel.loaded_at && (
                      <Field
                        label="Loaded onto bus"
                        value={new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(parcel.loaded_at))}
                      />
                    )}
                    {parcel.arrived_at && (
                      <Field
                        label="Arrived at destination"
                        value={new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(parcel.arrived_at))}
                      />
                    )}
                    {parcel.collected_at && (
                      <Field
                        label="Collected by receiver"
                        value={new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(parcel.collected_at))}
                      />
                    )}
                  </dl>
                </section>
              )}

              {/* Download Receipt — only for collected parcels */}
              {parcel.status === "picked_up" && (
                <section>
                  <a
                    href={`/api/proxy/parcels/${parcel.id}/receipt`}
                    download={`receipt-${parcel.tracking_number}.pdf`}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download Receipt
                  </a>
                </section>
              )}

              {/* Pickup reminder + Resend OTP — only for arrived parcels */}
              {parcel.status === "arrived" && (
                <section className="space-y-3">
                  <div>
                    <button
                      disabled={reminderSending}
                      onClick={async () => {
                        setReminderSending(true);
                        setReminderMsg(null);
                        try {
                          const res = await clientFetch<{ sms_sent: boolean }>(
                            `parcels/${parcel.id}/remind`,
                            { method: "POST" }
                          );
                          setReminderMsg(
                            res.sms_sent
                              ? "Reminder SMS sent to receiver."
                              : "Reminder already sent recently — skipped."
                          );
                        } catch (err) {
                          setReminderMsg(
                            err instanceof Error ? err.message : "Failed to send reminder."
                          );
                        } finally {
                          setReminderSending(false);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      <Bell className="h-4 w-4" />
                      {reminderSending ? "Sending…" : "Send Pickup Reminder"}
                    </button>
                    {reminderMsg && (
                      <p className="mt-2 text-xs text-zinc-500">{reminderMsg}</p>
                    )}
                  </div>
                  <div>
                    <button
                      disabled={otpSending}
                      onClick={async () => {
                        setOtpSending(true);
                        setOtpMsg(null);
                        try {
                          await clientFetch<{ sent: boolean }>(
                            `parcels/${parcel.id}/resend-otp`,
                            { method: "POST" }
                          );
                          setOtpMsg("New OTP sent to receiver.");
                        } catch (err) {
                          setOtpMsg(
                            err instanceof Error ? err.message : "Failed to resend OTP."
                          );
                        } finally {
                          setOtpSending(false);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {otpSending ? "Sending…" : "Resend OTP"}
                    </button>
                    {otpMsg && (
                      <p className="mt-2 text-xs text-zinc-500">{otpMsg}</p>
                    )}
                  </div>
                </section>
              )}

              {/* Audit log — managers only */}
              {canViewLogs && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList className="h-3.5 w-3.5 text-zinc-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Audit Log</h3>
                  </div>
                  {logsLoading ? (
                    <p className="text-xs text-zinc-400">Loading…</p>
                  ) : logs.length === 0 ? (
                    <p className="text-xs text-zinc-400">No log entries.</p>
                  ) : (
                    <ol className="space-y-2">
                      {logs.map((entry) => (
                        <li key={entry.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-700">{entry.action}</span>
                            <span className="text-xs text-zinc-400">
                              {entry.created_at
                                ? new Intl.DateTimeFormat("en-GH", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.created_at))
                                : "—"}
                            </span>
                          </div>
                          {entry.actor_name && (
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {entry.actor_name}
                              {entry.actor_role ? ` · ${entry.actor_role}` : ""}
                            </p>
                          )}
                          {entry.note && <p className="text-xs text-zinc-600 mt-1">{entry.note}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
