"use client";

import { useState } from "react";

interface SmsPreferencesCardProps {
  initialOptOut: boolean;
}

export default function SmsPreferencesCard({ initialOptOut }: SmsPreferencesCardProps) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleToggle() {
    const newValue = !optOut;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/proxy/api/v1/auth/sms-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_opt_out: newValue }),
      });
      if (!res.ok) throw new Error("Failed to save preference.");
      setOptOut(newValue);
      setMessage({ text: "Preference saved.", ok: true });
    } catch {
      setMessage({ text: "Could not save preference.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 max-w-lg">
      <h2 className="text-base font-medium text-zinc-800 mb-1">SMS Notifications</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Control whether SMS messages are sent when you perform actions (e.g., logging parcels,
        loading onto trips).
      </p>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-800">Opt out of SMS</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {optOut ? "SMS notifications are currently disabled." : "SMS notifications are currently enabled."}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          aria-pressed={optOut}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 ${
            optOut ? "bg-zinc-400" : "bg-blue-600"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              optOut ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {message && (
        <p className={`mt-3 text-xs ${message.ok ? "text-emerald-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
