"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";

const SCREEN_META: Record<string, { label: string; sub: string }> = {
  "/dashboard":   { label: "Dashboard",   sub: "Live operations summary" },
  "/parcels":     { label: "Parcels",     sub: "Logistics & tracking" },
  "/trips":       { label: "Trips",       sub: "Schedule and track transport" },
  "/tickets":     { label: "Tickets",     sub: "Issue and manage tickets" },
  "/stations":    { label: "Stations",    sub: "Origins and destinations" },
  "/vehicles":    { label: "Vehicles",    sub: "Fleet management" },
  "/fleet":       { label: "Fleet Map",   sub: "Live GPS positions" },
  "/intelligence":{ label: "Intelligence",sub: "Demand forecasting & insights" },
  "/corporate":   { label: "Corporate",   sub: "Business client accounts" },
  "/loyalty":     { label: "Loyalty",     sub: "Points and rewards program" },
  "/billing":     { label: "Billing",     sub: "Subscription and payments" },
  "/users":       { label: "Users",       sub: "Staff account management" },
  "/drivers":     { label: "Drivers",     sub: "Driver accounts" },
  "/audit":       { label: "Audit Log",   sub: "System event history" },
  "/webhooks":    { label: "Webhooks",    sub: "Failed events & dead-letter queue" },
  "/settings":    { label: "Settings",    sub: "System configuration" },
  "/companies":   { label: "Companies",   sub: "Tenant management" },
};

function getScreenMeta(pathname: string) {
  const key = Object.keys(SCREEN_META)
    .sort((a, b) => b.length - a.length)
    .find((k) => pathname === k || pathname.startsWith(k + "/"));
  return key ? SCREEN_META[key] : { label: "Dashboard", sub: "Live operations summary" };
}

export function TopBar() {
  const pathname = usePathname();
  const { label, sub } = getScreenMeta(pathname);
  const [time, setTime] = useState("");

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
    setTime(fmt());
    const t = setInterval(() => setTime(fmt()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="h-[60px] bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
      {/* Page title */}
      <div className="flex items-baseline gap-2.5">
        <span className="text-[15px] font-bold text-foreground">{label}</span>
        <span className="text-[13px] text-muted-foreground hidden sm:block">{sub}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 bg-[oklch(0.96_0.015_155)] px-3 py-1 rounded-full">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-scan-pulse" />
          <span className="text-[12px] font-semibold text-primary hidden sm:block">
            Live{time ? ` · ${time}` : ""}
          </span>
        </div>

        {/* Bell */}
        <button className="relative p-1 text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="h-[19px] w-[19px]" />
        </button>

        {/* Search hint */}
        <div className="hidden md:flex items-center gap-2 bg-[oklch(0.97_0.007_155)] px-3 py-1.5 rounded-lg border border-border cursor-text w-44">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[13px] text-muted-foreground flex-1">Quick search…</span>
          <span className="text-[10px] text-muted-foreground bg-border px-1 py-0.5 rounded">⌘K</span>
        </div>
      </div>
    </div>
  );
}
