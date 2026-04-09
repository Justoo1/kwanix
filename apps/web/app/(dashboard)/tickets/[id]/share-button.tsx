"use client";

import { useState, useTransition } from "react";
import { Share2, Copy, MessageCircle, Phone, Check, X, Loader2 } from "lucide-react";

import { shareTicket } from "./actions";

interface Props {
  ticketId: number;
  /** Pre-filled phone if the ticket has a real passenger number */
  defaultPhone: string | null;
  ticketUrl: string;
}

const PLACEHOLDER_PHONE = "233200000000"; // our walk-in fallback

export default function ShareButton({ ticketId, defaultPhone, ticketUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(
    defaultPhone && defaultPhone !== PLACEHOLDER_PHONE ? defaultPhone : ""
  );
  const [copied, setCopied] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCopy() {
    navigator.clipboard.writeText(ticketUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleWhatsApp() {
    const msg = encodeURIComponent(`Your bus ticket is ready. View & save it here:\n${ticketUrl}`);
    const number = phone.replace(/\D/g, "") || "";
    const wa = number
      ? `https://wa.me/${number}?text=${msg}`
      : `https://wa.me/?text=${msg}`;
    window.open(wa, "_blank");
  }

  function handleSendSMS() {
    if (!phone.trim()) {
      setSmsError("Please enter a phone number.");
      return;
    }
    setSmsError(null);
    startTransition(async () => {
      const res = await shareTicket(ticketId, phone);
      if (res.error) {
        setSmsError(res.error);
      } else if (res.sms_sent) {
        setSmsSent(true);
      } else {
        setSmsError("SMS could not be sent — SMS service may not be configured.");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 print:hidden"
      >
        <Share2 className="h-4 w-4" />
        Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 mb-4 sm:mb-0 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <h2 className="font-semibold text-zinc-900">Share Ticket</h2>
              <button
                onClick={() => { setOpen(false); setSmsSent(false); setSmsError(null); }}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Ticket link */}
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">Ticket link</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={ticketUrl}
                    className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-mono text-zinc-700 truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shrink-0"
                  >
                    {copied ? (
                      <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </button>
                </div>
              </div>

              {/* Phone input */}
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">
                  Passenger phone{" "}
                  <span className="text-zinc-400 font-normal">(Ghana number)</span>
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 focus-within:ring-2 focus-within:ring-zinc-400">
                  <Phone className="h-4 w-4 text-zinc-400 shrink-0" />
                  <input
                    type="tel"
                    placeholder="0241234567"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setSmsError(null); setSmsSent(false); }}
                    className="flex-1 text-sm text-zinc-800 bg-transparent outline-none"
                  />
                </div>
                {smsError && (
                  <p className="text-xs text-red-600 mt-1">{smsError}</p>
                )}
                {smsSent && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> SMS sent successfully!
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#25D366] px-4 py-3 text-sm font-semibold text-[#128C7E] hover:bg-[#25D366]/10 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>

                <button
                  onClick={handleSendSMS}
                  disabled={isPending || smsSent}
                  className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : smsSent ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Phone className="h-4 w-4" />
                  )}
                  {smsSent ? "Sent!" : "Send SMS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
