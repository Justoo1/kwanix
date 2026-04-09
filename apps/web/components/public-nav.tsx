import Link from "next/link";
import { Bus } from "lucide-react";

export default function PublicNav() {
  return (
    <header className="border-b border-zinc-100 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-900">
          <Bus className="h-5 w-5 text-emerald-600" />
          RoutePass
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/discover"
            className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Find a trip
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
          >
            Sign in →
          </Link>
        </nav>
      </div>
    </header>
  );
}
