import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Star, Trophy, Coins } from "lucide-react";

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

  const totalPoints = leaderboard.reduce((s, a) => s + a.points_balance, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Loyalty Points</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Passengers earn 1 point per GHS 1 spent. 100 points = GHS 1.00 discount.
        </p>
      </div>

      {/* Config cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="inline-flex rounded-xl p-2.5 bg-primary/10 mb-3">
            <Star className="h-4 w-4 text-primary" />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground mb-1">Earn Rate</div>
          <div className="text-[22px] font-bold text-foreground">1 pt / GHS 1</div>
          <div className="text-[12px] text-muted-foreground mt-1">On every paid ticket or parcel</div>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="inline-flex rounded-xl p-2.5 bg-amber-500/10 mb-3">
            <Coins className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground mb-1">Redeem Rate</div>
          <div className="text-[22px] font-bold text-amber-600">100 pts = GHS 1</div>
          <div className="text-[12px] text-muted-foreground mt-1">Applied as a ticket discount</div>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="inline-flex rounded-xl p-2.5 bg-emerald-500/10 mb-3">
            <Trophy className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground mb-1">Total Members</div>
          <div className="text-[22px] font-bold text-primary">{leaderboard.length}</div>
          <div className="text-[12px] text-muted-foreground mt-1">{totalPoints.toLocaleString()} pts issued</div>
        </div>
      </div>

      {/* Phone lookup */}
      <LoyaltyClient />

      {/* Leaderboard */}
      {leaderboard.length > 0 ? (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="text-[14px] font-bold text-foreground">Top Earners</h2>
          </div>
          <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  {["Rank", "Name", "Phone", "Points", "GHS Value"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((acc, i) => (
                  <tr key={acc.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className={`text-[12px] font-bold ${i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"}`}>
                        #{i + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-foreground">
                      {acc.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[12px] text-muted-foreground">{acc.phone}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-amber-600">
                        <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                        {acc.points_balance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-primary">
                      GHS {acc.ghs_value.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-12 text-center">
          <div className="rounded-2xl p-4 bg-primary/10 w-fit mx-auto mb-4">
            <Star className="h-8 w-8 text-primary" />
          </div>
          <p className="text-[14px] font-semibold text-foreground/70">No loyalty members yet</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Points are earned automatically when tickets or parcels are paid.
          </p>
        </div>
      )}
    </div>
  );
}
