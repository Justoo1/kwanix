"use client"

import { useState } from "react"
import { FileSpreadsheet, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  tripId: number
}

export default function ManifestCsvButton({ tripId }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    if (loading) return
    setLoading(true)

    try {
      const res = await fetch(`/api/proxy/trips/${tripId}/manifest.csv`, {
        credentials: "include",
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        let msg: string
        try {
          msg = (JSON.parse(text) as { detail?: string })?.detail ?? text
        } catch {
          msg = text
        }
        throw new Error(msg || `CSV download failed (HTTP ${res.status})`)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `manifest_trip_${tripId}.csv`
      anchor.style.display = "none"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => window.URL.revokeObjectURL(url), 5_000)

      toast.success("CSV ready", {
        description: `manifest_trip_${tripId}.csv has been saved to your downloads.`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not download CSV"
      toast.error("Download failed", { description: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60 transition-colors"
      aria-label="Download trip manifest as CSV"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="size-4" />
      )}
      {loading ? "Downloading…" : "Download CSV"}
    </button>
  )
}
