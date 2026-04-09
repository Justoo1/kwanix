import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { StationsView } from "./stations-view";

export const metadata: Metadata = { title: "Stations — RoutePass" };

const ALLOWED_ROLES = ["station_manager", "company_admin", "super_admin"];
const CREATE_ROLES = ["company_admin", "super_admin"];

export default async function StationsPage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (!ALLOWED_ROLES.includes(role)) {
    redirect("/dashboard");
  }

  const canManage = CREATE_ROLES.includes(role);
  return <StationsView canCreate={canManage} canManage={canManage} />;
}
