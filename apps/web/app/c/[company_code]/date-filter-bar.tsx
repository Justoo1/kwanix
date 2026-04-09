"use client";

import { useRouter } from "next/navigation";

interface Props {
  companyCode: string;
  selectedDate: string | undefined;
}

export default function DateFilterBar({ companyCode, selectedDate }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val) {
      router.replace(`/c/${companyCode}?date=${val}`);
    } else {
      router.replace(`/c/${companyCode}`);
    }
  }

  function handleClear() {
    router.replace(`/c/${companyCode}`);
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-zinc-500 shrink-0">Filter by date:</label>
      <input
        type="date"
        min={today}
        value={selectedDate ?? ""}
        onChange={handleChange}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
      />
      {selectedDate && (
        <button
          onClick={handleClear}
          className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
