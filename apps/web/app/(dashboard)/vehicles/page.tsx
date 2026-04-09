import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { VehiclesView } from "./vehicles-view";

export const metadata: Metadata = { title: "Vehicles — Kwanix" };

const ALLOWED_ROLES = [
  "company_admin",
  "super_admin",
  "station_manager",
  "station_clerk",
];
const CREATE_ROLES = ["company_admin", "super_admin"];
const MANAGE_ROLES = ["company_admin", "super_admin", "station_manager"];

export default async function VehiclesPage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (!ALLOWED_ROLES.includes(role)) {
    redirect("/dashboard");
  }

  return (
    <VehiclesView
      canCreate={CREATE_ROLES.includes(role)}
      canManage={MANAGE_ROLES.includes(role)}
    />
  );
}
