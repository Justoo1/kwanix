import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

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
  picked_up: "bg-emerald-100 text-emerald-800",
  returned: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Audit Log</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Last 100 parcel status changes across your company.
        </p>
      </div>

      <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-2xl p-4 bg-primary/10 mb-4">
              <ClipboardList className="h-8 w-8 text-primary" />
            </div>
            <p className="text-[14px] font-semibold text-foreground/70">No audit entries found.</p>
            <p className="text-[12px] text-muted-foreground mt-1">Status changes will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  {["Time", "Parcel", "Clerk", "From", "To", "Note"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-[12px] text-muted-foreground whitespace-nowrap">
                      {new Intl.DateTimeFormat("en-GH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(entry.occurred_at))}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[12px] font-semibold text-foreground">
                      {entry.parcel_tracking_number ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-foreground">
                      {entry.clerk_name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {entry.previous_status ? (
                        <StatusBadge status={entry.previous_status} />
                      ) : (
                        <span className="text-muted-foreground text-[12px]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={entry.new_status} />
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-muted-foreground max-w-xs truncate">
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
