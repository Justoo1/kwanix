import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { DashboardStatsView } from "./stats-view";

export const metadata: Metadata = { title: "Dashboard — Kwanix" };

export default async function DashboardPage() {
  const session = await getSession();

  if (session?.user.role === "super_admin") {
    redirect("/companies");
  }

  return (
    <DashboardStatsView
      role={session?.user.role ?? "station_clerk"}
      userName={session?.user.full_name ?? "User"}
    />
  );
}
