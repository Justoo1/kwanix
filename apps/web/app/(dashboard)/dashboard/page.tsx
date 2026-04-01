import type { Metadata } from "next";

import { getSession } from "@/lib/session";
import { DashboardStatsView } from "./stats-view";

export const metadata: Metadata = { title: "Dashboard — RoutePass" };

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <DashboardStatsView
      role={session?.user.role ?? "station_clerk"}
      userName={session?.user.full_name ?? "User"}
    />
  );
}
