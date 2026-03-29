"use client";

import { useActionState } from "react";
import Image from "next/image";

import { createParcel, type CreateParcelState } from "./actions";

interface StationOption {
  id: number;
  name: string;
  location_code: string | null;
}

export default function CreateParcelForm({
  stations,
}: {
  stations: StationOption[];
}) {
  const [state, action, pending] = useActionState<
    CreateParcelState,
    FormData
  >(createParcel, undefined);

  if (state?.tracking_number) {
    return (
      <div className="text-center space-y-4">
        <div className="text-emerald-600 font-semibold text-sm">
          Parcel logged successfully!
        </div>
        <p className="text-sm text-zinc-600">
          Tracking number:{" "}
          <span className="font-mono font-bold text-zinc-900">
            {state.tracking_number}
          </span>
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sender Name" name="sender_name" required />
        <PhoneField label="Sender Phone" name="sender_phone" required />
        <Field label="Receiver Name" name="receiver_name" required />
        <PhoneField label="Receiver Phone" name="receiver_phone" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Origin Station"
          name="origin_station_id"
          options={stations}
          required
        />
        <SelectField
          label="Destination Station"
          name="destination_station_id"
          options={stations}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)" name="weight_kg" type="number" step="0.1" />
        <Field label="Fee (GHS)" name="fee_ghs" type="number" step="0.01" defaultValue="0" />
      </div>

      <Field label="Description (optional)" name="description" />

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
  label,
  name,
  type = "text",
  required,
  step,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">
        {label}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        step={step}
        defaultValue={defaultValue}
        className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />
    </div>
  );
}

function PhoneField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">
        {label}
      </label>
      <input
        name={name}
        type="tel"
        required={required}
        placeholder="0541234567"
        className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: StationOption[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">
        {label}
      </label>
      <select
        name={name}
        required={required}
        className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
      >
        <option value="">Select station…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
