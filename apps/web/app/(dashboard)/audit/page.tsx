import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Audit Log — Kwanix" };

interface AuditLogEntry {
  id: number;
  parcel_tracking_number: string | null;
  clerk_name: string | null;
  previous_status: string | null;
  new_status: string;
  note: string | null;
  occurred_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  in_transit: "bg-blue-100 text-blue-800",
  arrived: "bg-purple-100 text-purple-800",
  picked_up: "bg-green-100 text-green-800",
  returned: "bg-zinc-100 text-zinc-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-700"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default async function AuditLogPage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (role !== "company_admin" && role !== "super_admin") {
    redirect("/dashboard");
  }

  const entries = await apiFetch<AuditLogEntry[]>("/api/v1/admin/audit-log").catch(
    () => [] as AuditLogEntry[]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 100 parcel status changes across your company.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {entries.length === 0 ? (
          <p className="px-6 py-10 text-sm text-center text-muted-foreground">
            No audit entries found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Time</th>
                  <th className="px-5 py-3 text-left">Parcel</th>
                  <th className="px-5 py-3 text-left">Clerk</th>
                  <th className="px-5 py-3 text-left">From</th>
                  <th className="px-5 py-3 text-left">To</th>
                  <th className="px-5 py-3 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors"
                  >
                    <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">
                      {new Intl.DateTimeFormat("en-GH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(entry.occurred_at))}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-zinc-800">
                      {entry.parcel_tracking_number ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-700">
                      {entry.clerk_name ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {entry.previous_status ? (
                        <StatusBadge status={entry.previous_status} />
                      ) : (
                        <span className="text-zinc-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={entry.new_status} />
                    </td>
                    <td className="px-5 py-3 text-zinc-500 text-xs max-w-xs truncate">
                      {entry.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
