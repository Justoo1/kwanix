/**
 * GET /api/manifest/[id]
 *
 * Server-side proxy that:
 *  1. Reads the kx_session HttpOnly cookie to obtain the Bearer token.
 *  2. Streams the raw PDF binary from FastAPI's
 *     GET /api/v1/trips/{id}/manifest to the browser.
 *
 * This lives in the Next.js App Router API rather than the generic catch-all
 * proxy (/api/proxy/[...path]) because the generic proxy calls `.json()` on
 * the upstream response — which would corrupt a binary PDF stream.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"

// Prefer the internal Docker URL (API_INTERNAL_URL) for server-to-server requests,
// matching the same priority order used in lib/api.ts (apiFetch).
const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000"

type Context = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Context) {
  const [session, { id }] = await Promise.all([getSession(), params])

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${API_BASE}/api/v1/trips/${id}/manifest`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not reach API"
    return NextResponse.json({ error: `Manifest unavailable: ${msg}` }, { status: 502 })
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "Manifest unavailable")
    return NextResponse.json(
      { error: text },
      { status: upstream.status }
    )
  }

  const pdfBuffer = await upstream.arrayBuffer()

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="manifest_trip_${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
