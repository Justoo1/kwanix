import { XCircle, Bus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PaymentCancelledPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-2">
          <Bus className="h-5 w-5 text-emerald-600" />
          <span className="font-bold text-zinc-900 text-lg">Kwanix</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <XCircle className="h-14 w-14 text-zinc-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Payment not completed</h1>
        <p className="text-sm text-zinc-600 mb-8">
          You cancelled the payment or it was not completed. No charge has been made.
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
