import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { UserResponse } from "@/lib/definitions";

import UsersClient from "./users-client";

interface StationOption {
  id: number;
  name: string;
}

export default async function UsersPage() {
  const session = await getSession();
  const role = session?.user.role;

  if (role !== "super_admin" && role !== "company_admin") {
    redirect("/dashboard");
  }

  const [users, stations] = await Promise.all([
    apiFetch<UserResponse[]>("/api/v1/admin/users"),
    role === "company_admin"
      ? apiFetch<StationOption[]>("/api/v1/stations").catch(() => [] as StationOption[])
      : Promise.resolve([] as StationOption[]),
  ]);

  return <UsersClient users={users} viewerRole={role} stations={stations} />;
}
