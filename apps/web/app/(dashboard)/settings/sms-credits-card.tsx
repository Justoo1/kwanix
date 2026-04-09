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

interface ArkeselBalance {
  balance: number;
  currency?: string;
}

function useArkeselBalance() {
  return useQuery<ArkeselBalance>({
    queryKey: ["admin", "arkesel-balance"],
    queryFn: () => clientFetch<ArkeselBalance>("admin/arkesel-balance"),
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  });
}

export default function SmsCreditsCard() {
  const { data, isLoading, isError } = useArkeselBalance();

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>SMS Credits</CardTitle>
        <CardDescription>
          Arkesel balance used for OTP and notification messages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-zinc-400 animate-pulse">Loading balance…</p>
        )}
        {isError && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Balance unavailable — check Arkesel dashboard directly.
          </p>
        )}
        {data && <BalanceDisplay balance={data.balance} />}
      </CardContent>
    </Card>
  );
}

function BalanceDisplay({ balance }: { balance: number }) {
  const isCritical = balance < 20;
  const isLow = balance < 100;

  const colors = isCritical
    ? "text-red-700 bg-red-50 border-red-200"
    : isLow
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-emerald-700 bg-emerald-50 border-emerald-200";

  const statusLabel = isCritical
    ? "Critical — top up immediately"
    : isLow
    ? "Low — top up soon"
    : "Healthy";

  return (
    <div className={`rounded-md border px-4 py-3 ${colors}`}>
      <p className="text-2xl font-bold tabular-nums">
        {balance.toLocaleString()}
        <span className="text-sm font-normal ml-1 opacity-75">credits</span>
      </p>
      <p className="text-xs mt-1 font-medium">{statusLabel}</p>
    </div>
  );
}
