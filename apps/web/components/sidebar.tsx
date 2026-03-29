"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Bus,
  Ticket,
  Building2,
  Users,
  Truck,
  MapPin,
  Settings,
  LogOut,
} from "lucide-react";

import { logout } from "@/actions/auth";
import type { UserRole } from "@/lib/definitions";

const superAdminItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/users", label: "Users", icon: Users },
];

const companyAdminItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parcels", label: "Parcels", icon: Package },
  { href: "/trips", label: "Trips", icon: Bus },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/stations", label: "Stations", icon: MapPin },
  { href: "/vehicles", label: "Vehicles", icon: Truck },
  { href: "/users", label: "Users", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

const managerItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parcels", label: "Parcels", icon: Package },
  { href: "/trips", label: "Trips", icon: Bus },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/stations", label: "Stations", icon: MapPin },
  { href: "/vehicles", label: "Vehicles", icon: Truck },
];

const clerkItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parcels", label: "Parcels", icon: Package },
  { href: "/trips", label: "Trips", icon: Bus },
  { href: "/tickets", label: "Tickets", icon: Ticket },
];

function getNavItems(role: UserRole) {
  if (role === "super_admin") return superAdminItems;
  if (role === "company_admin") return companyAdminItems;
  if (role === "station_manager") return managerItems;
  return clerkItems;
}

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-zinc-900 text-zinc-100 min-h-screen">
      <div className="px-5 py-5 border-b border-zinc-700">
        <span className="text-lg font-bold tracking-tight">RoutePass</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-zinc-700">
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
