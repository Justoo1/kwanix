"use client";

import { useActionState, useState, useEffect, useMemo } from "react";
import Image from "next/image";

import { createParcel, type CreateParcelState } from "./actions";
import { validateGhanaPhone } from "@/lib/schemas";
import { clientFetch } from "@/lib/client-api";

interface StationOption {
  id: number;
  name: string;
  location_code: string | null;
}

interface WeightTier {
  max_kg: number | null;
  fee_ghs: number;
}

function calcFee(weightKg: number, tiers: WeightTier[]): number | null {
  if (tiers.length === 0) return null;
  // tiers are matched top-to-bottom; first tier whose max_kg >= weight (or null = unlimited)
  for (const tier of tiers) {
    if (tier.max_kg === null || weightKg <= tier.max_kg) {
      return tier.fee_ghs;
    }
  }
  // Fall through to last tier (catch-all)
  return tiers[tiers.length - 1].fee_ghs;
}

export default function CreateParcelForm({
  stations,
}: {
  stations: StationOption[];
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<CreateParcelState, FormData>(createParcel, undefined);

  const [weightStr, setWeightStr] = useState("");
  const [manualFeeStr, setManualFeeStr] = useState("0");
  const [tiers, setTiers] = useState<WeightTier[]>([]);

  // Fetch weight tiers once on mount
  useEffect(() => {
    clientFetch<{ tiers: WeightTier[] }>("admin/companies/me/weight-tiers")
      .then((data) => setTiers(data.tiers))
      .catch(() => {/* tiers unavailable — manual fee entry */});
  }, []);

  // Derive fee from weight + tiers; falls back to whatever the user typed
  const autoFee = useMemo(() => {
    const w = parseFloat(weightStr);
    if (!isNaN(w) && w > 0 && tiers.length > 0) return calcFee(w, tiers);
    return null;
  }, [weightStr, tiers]);

  const feeStr = autoFee !== null ? autoFee.toFixed(2) : manualFeeStr;
  const feeAutoCalc = autoFee !== null;

  if (state?.tracking_number) {
    return (
      <div className="text-center space-y-4">
        <div className="text-emerald-600 font-semibold text-sm">Parcel logged successfully!</div>
        <p className="text-sm text-zinc-600">
          Tracking number:{" "}
          <span className="font-mono font-bold text-zinc-900">{state.tracking_number}</span>
        </p>
        {state.qr_code_base64 && (
          <div className="flex justify-center">
            <Image
              src={`data:image/png;base64,${state.qr_code_base64}`}
              alt="Parcel QR code"
              width={160}
              height={160}
              className="rounded border border-zinc-200"
            />
          </div>
        )}
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-blue-600 hover:underline"
        >
          Log another parcel
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sender Name" name="sender_name" required />
        <PhoneField label="Sender Phone" name="sender_phone" required />
        <Field label="Receiver Name" name="receiver_name" required />
        <PhoneField label="Receiver Phone" name="receiver_phone" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Origin Station" name="origin_station_id" options={stations} required />
        <SelectField label="Destination Station" name="destination_station_id" options={stations} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Weight — drives auto fee */}
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Weight (kg)
          </label>
          <input
            name="weight_kg"
            type="number"
            step="0.1"
            min="0"
            value={weightStr}
            onChange={(e) => setWeightStr(e.target.value)}
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Fee — auto-filled from tiers or manually editable */}
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Fee (GHS)
            {feeAutoCalc && tiers.length > 0 && (
              <span className="ml-1.5 text-emerald-600 font-normal">(auto-calculated)</span>
            )}
            {!feeAutoCalc && tiers.length > 0 && (
              <span className="ml-1.5 text-zinc-400 font-normal">(enter weight to auto-fill)</span>
            )}
          </label>
          <input
            name="fee_ghs"
            type="number"
            step="0.01"
            min="0"
            value={feeStr}
            onChange={(e) => setManualFeeStr(e.target.value)}
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Show active tier table if tiers configured */}
      {tiers.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="text-xs font-medium text-zinc-500 mb-1.5">Pricing tiers</p>
          <div className="space-y-0.5">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-600">
                <span className="w-28">
                  {t.max_kg === null
                    ? `Over ${tiers[i - 1]?.max_kg ?? 0} kg`
                    : i === 0
                      ? `Up to ${t.max_kg} kg`
                      : `${tiers[i - 1]?.max_kg} – ${t.max_kg} kg`}
                </span>
                <span className="font-medium">GHS {t.fee_ghs.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Declared value (GHS)" name="declared_value_ghs" type="number" step="0.01" />
        <Field label="Description (optional)" name="description" />
      </div>

      {state?.message && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {pending ? "Logging parcel…" : "Log Parcel"}
      </button>
    </form>
  );
}

function Field({
  label, name, type = "text", required, step, defaultValue,
}: {
  label: string; name: string; type?: string; required?: boolean; step?: string; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      <input
        name={name} type={type} required={required} step={step} defaultValue={defaultValue}
        className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />
    </div>
  );
}

function PhoneField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      <input
        name={name} type="tel" required={required} placeholder="0541234567"
        aria-describedby={error ? `${name}-error` : undefined}
        onChange={(e) => {
          const val = e.target.value;
          setError(val.length > 0 ? validateGhanaPhone(val) : null);
        }}
        className={`block w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 ${
          error ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500"
        }`}
      />
      {error && <p id={`${name}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SelectField({
  label, name, options, required,
}: {
  label: string; name: string; options: StationOption[]; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      <select
        name={name} required={required}
        className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
      >
        <option value="">Select station…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
