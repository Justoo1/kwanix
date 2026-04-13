import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import DriverDashboardClient from "./driver-client";
import type { DriverTripData } from "@/hooks/use-driver";

export default async function DriverPage() {
  const session = await getSession();
  if (!session || session.user.role !== "driver") {
    redirect("/login");
  }

  const tripData = await apiFetch<DriverTripData>("/api/v1/driver/trip").catch(
    () => null
  );

  return <DriverDashboardClient initialData={tripData} />;
}
