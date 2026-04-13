import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { UserResponse } from "@/lib/definitions";
import DriversClient from "./drivers-client";

export const metadata: Metadata = { title: "Drivers — Kwanix" };

const ALLOWED_ROLES = ["company_admin", "super_admin", "station_manager"];

export default async function DriversPage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (!ALLOWED_ROLES.includes(role)) {
    redirect("/dashboard");
  }

  const drivers = await apiFetch<UserResponse[]>("/api/v1/admin/users?role=driver").catch(
    () => [] as UserResponse[]
  );

  return (
    <DriversClient
      drivers={drivers}
      canManage={role === "company_admin" || role === "super_admin"}
    />
  );
}
