/**
 * Fetches the trip manifest PDF from the dedicated manifest API route and
 * triggers a browser file-download dialog.
 *
 * FastAPI's GET /api/v1/trips/{id}/manifest returns a raw application/pdf
 * binary stream — not JSON. We proxy it through /api/manifest/[id] (which
 * handles session auth server-side), capture it as a Blob, create a
 * temporary object URL, and drive the OS save dialog via a hidden <a> tag.
 *
 * Callers should wrap this in a try/catch and surface errors via toast.
 */
export async function downloadManifest(tripId: number): Promise<void> {
  const res = await fetch(`/api/manifest/${tripId}`)

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    let message: string
    try {
      message = (JSON.parse(body) as { error?: string })?.error ?? body
    } catch {
      message = body
    }
    throw new Error(message || `Manifest download failed (HTTP ${res.status})`)
  }

  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)

  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `manifest_trip_${tripId}.pdf`
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // Revoke after a short delay to let the browser initiate the download
  setTimeout(() => window.URL.revokeObjectURL(url), 5_000)
}
