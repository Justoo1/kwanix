import { Bus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-2">
          <Bus className="h-5 w-5 text-emerald-600" />
          <span className="font-bold text-zinc-900 text-lg">Kwanix</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-6xl font-bold text-zinc-200 mb-4">404</p>
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Page not found</h1>
        <p className="text-sm text-zinc-600 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to trip search
        </Link>
      </div>
    </div>
  );
}
