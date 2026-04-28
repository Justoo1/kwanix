"use client";

import { useState } from "react";
import { Search, Loader2, Star, Clock } from "lucide-react";
import { toast } from "sonner";

interface LoyaltyAccount {
  id: number;
  phone: string;
  full_name: string | null;
  points_balance: number;
  ghs_value: number;
}

interface LoyaltyTx {
  id: number;
  transaction_type: string;
  points: number;
  source_type: string | null;
  source_id: number | null;
  note: string | null;
  created_at: string;
}

export default function LoyaltyClient() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [history, setHistory] = useState<LoyaltyTx[]>([]);
  const [redeemPts, setRedeemPts] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setAccount(null);
    setHistory([]);
    try {
      const enc = encodeURIComponent(phone.trim());
      const [acc, hist] = await Promise.all([
        fetch(`/api/proxy/loyalty/account/${enc}`).then((r) => r.json()),
        fetch(`/api/proxy/loyalty/account/${enc}/history?limit=10`).then((r) => r.json()),
      ]);
      if (acc?.id) {
        setAccount(acc);
        setHistory(Array.isArray(hist) ? hist : []);
      } else {
        toast.info("No loyalty account found for this number.");
      }
    } catch {
      toast.error("Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function redeemPoints(e: React.FormEvent) {
    e.preventDefault();
    const pts = parseInt(redeemPts, 10);
    if (!pts || pts < 100) {
      toast.error("Minimum redemption is 100 points");
      return;
    }
    setRedeeming(true);
    try {
      const res = await fetch("/api/proxy/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: account!.phone, points_to_redeem: pts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail?.message ?? data?.detail ?? "Redemption failed");
      toast.success(`GHS ${data.ghs_discount.toFixed(2)} discount applied`);
      setAccount((prev) => prev ? { ...prev, points_balance: data.remaining_balance, ghs_value: data.remaining_balance / 100 } : prev);
      setRedeemPts("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Redemption failed");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">Look Up Member</h2>
        <form onSubmit={lookup} className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0244000000"
            className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Look up
          </button>
        </form>
      </section>

      {account && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-900">{account.full_name ?? account.phone}</p>
              <p className="font-mono text-xs text-zinc-500">{account.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-600 flex items-center gap-1 justify-end">
                <Star className="h-5 w-5 fill-amber-400 stroke-amber-400" />
                {account.points_balance.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-400">≈ GHS {account.ghs_value.toFixed(2)} discount</p>
            </div>
          </div>

          {account.points_balance >= 100 && (
            <form onSubmit={redeemPoints} className="flex gap-2 items-center border-t border-zinc-100 pt-4">
              <input
                type="number"
                min="100"
                max={account.points_balance}
                step="100"
                value={redeemPts}
                onChange={(e) => setRedeemPts(e.target.value)}
                placeholder="Points to redeem (min 100)"
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              <button
                type="submit"
                disabled={redeeming}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {redeeming && <Loader2 className="h-4 w-4 animate-spin" />}
                Redeem
              </button>
            </form>
          )}

          {history.length > 0 && (
            <div className="border-t border-zinc-100 pt-4">
              <p className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recent activity
              </p>
              <div className="space-y-1">
                {history.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600">{tx.note ?? tx.transaction_type}</span>
                    <span className={`font-medium ${tx.points > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {tx.points > 0 ? "+" : ""}{tx.points} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
