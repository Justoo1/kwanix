import { LogOut, Route } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/actions/auth";
import { getSession } from "@/lib/session";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "driver") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* Top bar */}
      <header className="bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between shrink-0">
        <Link href="/driver" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
            <Route className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-tight text-sidebar-foreground">
            Kwanix
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <span className="text-sm text-sidebar-foreground/80 font-medium">
            {session.user.full_name}
          </span>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sign out"
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
