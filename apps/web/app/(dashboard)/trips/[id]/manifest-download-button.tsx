"use client"

import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { downloadManifest } from "@/lib/download-manifest"

interface Props {
  tripId: number
}

export default function ManifestDownloadButton({ tripId }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    if (loading) return
    setLoading(true)

    const toastId = toast.loading("Generating manifest PDF…", {
      description: "This may take a moment for large trips.",
    })

    try {
      await downloadManifest(tripId)
      toast.success("Manifest ready", {
        id: toastId,
        description: `manifest_trip_${tripId}.pdf has been saved to your downloads.`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not download manifest"
      toast.error("Download failed", {
        id: toastId,
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:opacity-60 transition-colors"
      aria-label="Download trip manifest as PDF"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileDown className="size-4" />
      )}
      {loading ? "Generating…" : "Download Manifest"}
    </button>
  )
}
