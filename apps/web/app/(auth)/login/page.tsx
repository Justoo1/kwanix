import type { Metadata } from "next";
import { Route, Bus, MapPin, Package } from "lucide-react";

import LoginForm from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in — Kwanix",
};

const features = [
  { icon: Bus, label: "Fleet & trip scheduling" },
  { icon: Package, label: "Parcel tracking & logistics" },
  { icon: MapPin, label: "Multi-station operations" },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* ── Left brand panel (desktop only) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col justify-between bg-sidebar p-12 relative overflow-hidden">
        {/* Subtle background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-primary/5 blur-3xl"
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary shadow-md">
            <Route className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight text-sidebar-foreground">
            Kwanix
          </span>
        </div>

        {/* Headline */}
        <div className="relative space-y-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold leading-tight text-sidebar-foreground">
              Unified Transit
              <br />
              Management
            </h2>
            <p className="text-sidebar-foreground/60 text-sm leading-relaxed max-w-xs">
              End-to-end ticketing and parcel logistics for Ghana&apos;s modern
              transit operators.
            </p>
          </div>

          <ul className="space-y-3">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-accent/30">
                  <Icon className="h-3.5 w-3.5 text-sidebar-foreground/70" />
                </div>
                <span className="text-sm text-sidebar-foreground/70">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="relative text-xs text-sidebar-foreground/30">
          © {new Date().getFullYear()} Kwanix · All rights reserved
        </p>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-md animate-fade-up">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center justify-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Route className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Kwanix
            </span>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-border bg-card p-8 shadow-lg shadow-black/5">
            <div className="mb-7 space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Welcome back
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your station dashboard
              </p>
            </div>

            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
