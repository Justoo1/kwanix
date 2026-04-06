"use client";

import { useState, useEffect } from "react";
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
  Menu,
  X,
  Route,
  Webhook,
} from "lucide-react";

import { logout } from "@/actions/auth";
import type { UserRole } from "@/lib/definitions";
import { cn } from "@/lib/utils";

/* ─── Nav item definitions ─────────────────────────────────── */

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
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
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

/* ─── Shared nav link ───────────────────────────────────────── */

interface NavLinkProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick?: () => void;
}

function NavLink({ href, label, icon: Icon, active, onClick }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
        "btn-press",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-150",
          "group-hover:scale-110",
          active && "text-sidebar-primary-foreground"
        )}
      />
      {label}
    </Link>
  );
}

/* ─── Sidebar panel ─────────────────────────────────────────── */

interface SidebarPanelProps {
  role: UserRole;
  onClose?: () => void;
}

function SidebarPanel({ role, onClose }: SidebarPanelProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <aside className="flex flex-col w-64 h-full bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 group" onClick={onClose}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
            <Route className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-tight text-sidebar-foreground">
            RoutePass
          </span>
        </Link>

        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={active}
              onClick={onClose}
            />
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <form action={logout}>
          <button
            type="submit"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2",
              "text-sm font-medium text-sidebar-foreground/60",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "transition-all duration-150 btn-press"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

/* ─── Desktop sidebar — flex column, hidden on mobile ───────── */

export default function Sidebar({ role }: { role: UserRole }) {
  return (
    <div className="hidden md:flex md:flex-col md:w-64 md:shrink-0">
      <div className="sticky top-0 h-screen">
        <SidebarPanel role={role} />
      </div>
    </div>
  );
}

/* ─── Mobile nav — top bar + drawer, placed inside content col ─ */

export function MobileNav({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Entire mobile nav is hidden on desktop via the wrapper div
  return (
    <div className="md:hidden">
      {/* Mobile top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-sidebar-border shrink-0">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-sidebar-primary">
            <Route className="h-3 w-3 text-sidebar-primary-foreground" />
          </div>
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
            RoutePass
          </span>
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-up"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64",
          "transform transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarPanel role={role} onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
