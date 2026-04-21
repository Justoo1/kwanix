import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Star, Trophy } from "lucide-react";

import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import LoyaltyClient from "./LoyaltyClient";

export const metadata: Metadata = { title: "Loyalty Points — Kwanix" };

interface LoyaltyAccount {
  id: number;
  phone: string;
  full_name: string | null;
  points_balance: number;
  ghs_value: number;
}

export default async function LoyaltyPage() {
  const session = await getSession();
  if (!session || !["company_admin", "super_admin"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  let leaderboard: LoyaltyAccount[] = [];
  try {
    leaderboard = await apiFetch<LoyaltyAccount[]>("/api/v1/loyalty/leaderboard?limit=20");
  } catch {
    // render empty
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Loyalty Points</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Passengers earn 1 point per GHS 1 spent. 100 points = GHS 1.00 discount.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Earn rate</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">1 pt / GHS 1</p>
          <p className="text-xs text-zinc-400 mt-1">On every paid ticket or parcel</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Redeem rate</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">100 pts = GHS 1</p>
          <p className="text-xs text-amber-500 mt-1">Applied as a ticket discount</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Total members</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{leaderboard.length}</p>
          <p className="text-xs text-emerald-500 mt-1">Active loyalty accounts</p>
        </div>
      </div>

      {/* Lookup tool */}
      <LoyaltyClient />

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" /> Top Earners
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">#</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Name</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Phone</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Points</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">GHS Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {leaderboard.map((acc, i) => (
                  <tr key={acc.id}>
                    <td className="px-4 py-2 text-xs text-zinc-400 font-medium">{i + 1}</td>
                    <td className="px-4 py-2 text-xs font-medium text-zinc-800">
                      {acc.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-600">{acc.phone}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                        <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                        {acc.points_balance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs font-semibold text-emerald-700">
                      GHS {acc.ghs_value.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {leaderboard.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <Star className="mx-auto h-10 w-10 text-zinc-300 mb-3" />
          <p className="text-sm font-semibold text-zinc-600">No loyalty members yet</p>
          <p className="text-xs text-zinc-400 mt-1">
            Points are earned automatically when tickets or parcels are paid.
          </p>
        </div>
      )}
    </div>
  );
}
