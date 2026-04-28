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
  ClipboardList,
  Map,
  BrainCircuit,
  BadgeDollarSign,
  Star,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { logout } from "@/actions/auth";
import type { UserRole } from "@/lib/definitions";
import { cn } from "@/lib/utils";

/* ─── Nav item definitions ─────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  dividerAfter?: boolean;
}

const superAdminItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/users", label: "Users", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

const companyAdminItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parcels", label: "Parcels", icon: Package },
  { href: "/trips", label: "Trips", icon: Bus },
  { href: "/tickets", label: "Tickets", icon: Ticket, dividerAfter: true },
  { href: "/stations", label: "Stations", icon: MapPin },
  { href: "/vehicles", label: "Vehicles", icon: Truck },
  { href: "/fleet", label: "Fleet Map", icon: Map },
  { href: "/intelligence", label: "Intelligence", icon: BrainCircuit, dividerAfter: true },
  { href: "/corporate", label: "Corporate", icon: BadgeDollarSign },
  { href: "/loyalty", label: "Loyalty", icon: Star },
  { href: "/billing", label: "Billing", icon: CreditCard, dividerAfter: true },
  { href: "/users", label: "Users", icon: Users },
  { href: "/drivers", label: "Drivers", icon: Bus, dividerAfter: true },
  { href: "/audit", label: "Audit Log", icon: ClipboardList },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/settings", label: "Settings", icon: Settings },
];

const managerItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parcels", label: "Parcels", icon: Package },
  { href: "/trips", label: "Trips", icon: Bus },
  { href: "/tickets", label: "Tickets", icon: Ticket, dividerAfter: true },
  { href: "/stations", label: "Stations", icon: MapPin },
  { href: "/vehicles", label: "Vehicles", icon: Truck },
  { href: "/fleet", label: "Fleet Map", icon: Map },
  { href: "/intelligence", label: "Intelligence", icon: BrainCircuit, dividerAfter: true },
  { href: "/drivers", label: "Drivers", icon: Bus },
  { href: "/settings", label: "Settings", icon: Settings },
];

const clerkItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/parcels", label: "Parcels", icon: Package },
  { href: "/trips", label: "Trips", icon: Bus },
  { href: "/tickets", label: "Tickets", icon: Ticket, dividerAfter: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const driverItems: NavItem[] = [
  { href: "/driver", label: "My Trip", icon: Bus },
];

function getNavItems(role: UserRole): NavItem[] {
  if (role === "super_admin") return superAdminItems;
  if (role === "company_admin") return companyAdminItems;
  if (role === "station_manager") return managerItems;
  if (role === "driver") return driverItems;
  return clerkItems;
}

/* ─── Helpers ───────────────────────────────────────────────── */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRole(role: UserRole): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Sidebar panel ─────────────────────────────────────────── */

interface SidebarPanelProps {
  role: UserRole;
  userName: string;
  onClose?: () => void;
  forceExpanded?: boolean;
}

function SidebarPanel({ role, userName, onClose, forceExpanded }: SidebarPanelProps) {
  const pathname = usePathname();
  const navItems = getNavItems(role);
  const [collapsed, setCollapsed] = useState(false);

  const isCollapsed = forceExpanded ? false : collapsed;
  const initials = getInitials(userName);

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-sidebar border-r border-sidebar-border overflow-hidden",
        "transition-[width] duration-[220ms] ease-[ease]",
        isCollapsed ? "w-16" : "w-[232px]"
      )}
      style={{ background: "#0D1F17" }}
    >
      {/* Collapse toggle — desktop only, hidden when forceExpanded */}
      {!forceExpanded && (
        <button
          onClick={() => setCollapsed(!isCollapsed)}
          className="absolute top-[22px] right-[-11px] z-20 flex items-center justify-center cursor-pointer"
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#1A3528",
            border: "1px solid rgba(78,205,164,0.3)",
            color: "#4ECDA4",
          }}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed
            ? <ChevronRight style={{ width: 10, height: 10 }} />
            : <ChevronLeft style={{ width: 10, height: 10 }} />
          }
        </button>
      )}

      {/* Logo */}
      <div
        className={cn(
          "flex items-center border-b shrink-0",
          isCollapsed ? "justify-center px-0 py-[18px]" : "gap-2.5 px-4 py-[18px]"
        )}
        style={{ borderColor: "rgba(255,255,255,0.06)", marginBottom: 6 }}
      >
        <Link
          href={role === "driver" ? "/driver" : "/dashboard"}
          className="flex items-center gap-2.5 group"
          onClick={onClose}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary to-[oklch(0.77_0.11_165)] shrink-0">
            <Route className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <span
              className="text-[17px] font-bold tracking-tight text-white whitespace-nowrap overflow-hidden"
              style={{ letterSpacing: "-0.4px" }}
            >
              Kwanix
            </span>
          )}
        </Link>

        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-white/60 hover:text-white transition-colors md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        style={{ padding: "4px 8px", display: "flex", flexDirection: "column", gap: 1 }}
      >
        {navItems.map(({ href, label, icon: Icon, dividerAfter }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <div key={`${href}-${label}`}>
              <Link
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center rounded-lg cursor-pointer transition-all duration-[120ms]",
                  isCollapsed ? "justify-center px-0 py-[9px]" : "gap-[10px] px-[10px] py-[9px]"
                )}
                style={{
                  background: active ? "rgba(78,205,164,0.14)" : "transparent",
                  border: active ? "1px solid rgba(78,205,164,0.22)" : "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <Icon
                  className="shrink-0"
                  style={{
                    width: 16,
                    height: 16,
                    color: active ? "#4ECDA4" : "#6B8F7E",
                  }}
                />
                {!isCollapsed && (
                  <span
                    className="whitespace-nowrap text-[13px]"
                    style={{
                      color: active ? "#fff" : "#8AAF9A",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {label}
                  </span>
                )}
              </Link>
              {dividerAfter && (
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 4px" }} />
              )}
            </div>
          );
        })}
      </nav>

      {/* User section + sign-out */}
      <div
        className={cn(
          "shrink-0 flex flex-col",
          isCollapsed ? "items-center px-0 py-3" : "px-[14px] py-3"
        )}
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Avatar + name row */}
        <div
          className={cn(
            "flex items-center mb-2",
            isCollapsed ? "justify-center" : "gap-[10px]"
          )}
        >
          <div
            className="shrink-0 flex items-center justify-center rounded-full text-white font-bold"
            style={{
              width: 30,
              height: 30,
              background: "linear-gradient(135deg,#008A56,#4ECDA4)",
              fontSize: 12,
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            {initials}
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div
                className="truncate"
                style={{ color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "DM Sans, sans-serif" }}
              >
                {userName || "User"}
              </div>
              <div style={{ color: "#5A8070", fontSize: 11, fontFamily: "DM Sans, sans-serif" }}>
                {formatRole(role)}
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <form action={logout} className={isCollapsed ? "flex justify-center" : "w-full"}>
          <button
            type="submit"
            className={cn(
              "flex items-center gap-2 rounded-lg py-1.5 text-[12px] font-medium transition-colors",
              isCollapsed ? "justify-center px-2" : "px-2 w-full"
            )}
            style={{ color: "#5A8070" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#8AAF9A"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#5A8070"; }}
          >
            <LogOut style={{ width: 14, height: 14, flexShrink: 0 }} />
            {!isCollapsed && "Sign out"}
          </button>
        </form>
      </div>
    </aside>
  );
}

/* ─── Desktop sidebar ───────────────────────────────────────── */

export default function Sidebar({ role, userName }: { role: UserRole; userName: string }) {
  return (
    <div className="hidden md:flex md:flex-col md:shrink-0">
      <div className="sticky top-0 h-screen">
        <SidebarPanel role={role} userName={userName} />
      </div>
    </div>
  );
}

/* ─── Mobile nav ────────────────────────────────────────────── */

export function MobileNav({ role, userName }: { role: UserRole; userName: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Mobile top bar */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sidebar-border shrink-0" style={{ background: "#0D1F17" }}>
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-linear-to-br from-primary to-[oklch(0.77_0.11_165)]">
            <Route className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            Kwanix
          </span>
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50",
          "transform transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarPanel role={role} userName={userName} onClose={() => setOpen(false)} forceExpanded />
      </div>
    </div>
  );
}
