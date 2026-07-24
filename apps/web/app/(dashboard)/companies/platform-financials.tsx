"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-api";

interface PlatformFinancialsRow {
  company_id: number;
  company_name: string;
  billing_mode: string;
  tickets_cash_ghs: number;
  tickets_momo_ghs: number;
  tickets_online_ghs: number;
  parcels_cash_ghs: number;
  parcels_momo_ghs: number;
  total_revenue_ghs: number;
  platform_fees_pending_ghs: number;
  platform_fees_charged_ghs: number;
}

export default function PlatformFinancials() {
  const { data, isLoading } = useQuery<PlatformFinancialsRow[]>({
    queryKey: ["admin", "financials-summary"],
    queryFn: () => clientFetch<PlatformFinancialsRow[]>("admin/financials/summary"),
    staleTime: 60_000,
  });

  const rows = data ?? [];
  const totalCash = rows.reduce((s, r) => s + r.tickets_cash_ghs + r.parcels_cash_ghs, 0);
  const totalMomo = rows.reduce((s, r) => s + r.tickets_momo_ghs + r.parcels_momo_ghs, 0);
  const totalOnline = rows.reduce((s, r) => s + r.tickets_online_ghs, 0);
  const totalOwed = rows.reduce((s, r) => s + r.platform_fees_pending_ghs, 0);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100">
        <h2 className="text-base font-medium text-zinc-800">Platform Financials</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Revenue by payment method across all companies, and what each company owes the platform
          for cash sales that weren&apos;t auto-collected via Paystack.
        </p>
      </div>

      {/* Platform-wide totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 border-b border-zinc-100">
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Cash</p>
          <p className="text-lg font-semibold text-zinc-900">GHS {totalCash.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">MoMo</p>
          <p className="text-lg font-semibold text-zinc-900">GHS {totalMomo.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Online</p>
          <p className="text-lg font-semibold text-zinc-900">GHS {totalOnline.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Owed to platform</p>
          <p className="text-lg font-semibold text-amber-700">GHS {totalOwed.toFixed(2)}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="px-6 py-8 text-sm text-zinc-400 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-6 py-8 text-sm text-zinc-400 text-center">No companies yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-180">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Company</th>
                <th className="px-6 py-3 text-left font-medium">Billing mode</th>
                <th className="px-6 py-3 text-right font-medium">Cash</th>
                <th className="px-6 py-3 text-right font-medium">MoMo</th>
                <th className="px-6 py-3 text-right font-medium">Online</th>
                <th className="px-6 py-3 text-right font-medium">Total revenue</th>
                <th className="px-6 py-3 text-right font-medium">Owed (pending)</th>
                <th className="px-6 py-3 text-right font-medium">Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.company_id} className="hover:bg-zinc-50">
                  <td className="px-6 py-3.5">
                    <Link
                      href={`/companies/${r.company_id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {r.company_name}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.billing_mode === "per_transaction"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {r.billing_mode === "per_transaction" ? "Per Transaction" : "Subscription"}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right text-zinc-700">
                    GHS {(r.tickets_cash_ghs + r.parcels_cash_ghs).toFixed(2)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-zinc-700">
                    GHS {(r.tickets_momo_ghs + r.parcels_momo_ghs).toFixed(2)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-zinc-700">
                    GHS {r.tickets_online_ghs.toFixed(2)}
                  </td>
                  <td className="px-6 py-3.5 text-right font-medium text-zinc-900">
                    GHS {r.total_revenue_ghs.toFixed(2)}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span className={r.platform_fees_pending_ghs > 0 ? "text-amber-700 font-medium" : "text-zinc-400"}>
                      GHS {r.platform_fees_pending_ghs.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right text-emerald-700">
                    GHS {r.platform_fees_charged_ghs.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
