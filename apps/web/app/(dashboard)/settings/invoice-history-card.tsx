"use client";

import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Invoice {
  id: number;
  amount_ghs: number;
  billing_cycle: string;
  period_start: string;
  period_end: string;
  status: "pending" | "paid" | "failed" | "refunded";
  paystack_reference: string | null;
  paid_at: string | null;
  created_at: string;
}

const statusColors: Record<Invoice["status"], string> = {
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-zinc-100 text-zinc-700",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-blue-100 text-blue-800",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function InvoiceHistoryCard() {
  const { data, isLoading, isError } = useQuery<Invoice[]>({
    queryKey: ["billing", "invoices"],
    queryFn: () => clientFetch<Invoice[]>("billing/invoices?limit=10"),
    staleTime: 2 * 60_000,
    retry: false,
    meta: { silent: true },
  });

  return (
    <Card className="max-w-2xl mt-4">
      <CardHeader>
        <CardTitle>Invoice History</CardTitle>
        <CardDescription>Your last 10 subscription billing events.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-zinc-400 animate-pulse">Loading invoices…</p>
        )}
        {isError && (
          <p className="text-sm text-zinc-500">Could not load invoice history.</p>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-zinc-500">No invoices yet.</p>
        )}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="pb-2 pr-4 text-left font-medium">Date</th>
                  <th className="pb-2 pr-4 text-left font-medium">Period</th>
                  <th className="pb-2 pr-4 text-left font-medium">Cycle</th>
                  <th className="pb-2 pr-4 text-right font-medium">Amount</th>
                  <th className="pb-2 pr-4 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.map((inv) => (
                  <tr key={inv.id} className="py-2">
                    <td className="py-2 pr-4 text-zinc-700">{fmt(inv.created_at)}</td>
                    <td className="py-2 pr-4 text-zinc-600 whitespace-nowrap">
                      {fmt(inv.period_start)} – {fmt(inv.period_end)}
                    </td>
                    <td className="py-2 pr-4 capitalize text-zinc-600">{inv.billing_cycle}</td>
                    <td className="py-2 pr-4 text-right font-medium text-zinc-900 tabular-nums">
                      GHS {inv.amount_ghs.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[inv.status]}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-xs text-zinc-400 truncate max-w-[120px]">
                      {inv.paystack_reference ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
