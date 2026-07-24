/**
 * GET /api/geocode?mode=search&q=...
 * GET /api/geocode?mode=reverse&lat=...&lon=...
 *
 * Server-side proxy to Nominatim (OpenStreetMap geocoding). Nominatim's
 * usage policy requires requests to identify the calling application via a
 * User-Agent — browsers can't set that header from client-side fetch(), and
 * relying on the browser's Referer is unreliable (ad blockers, privacy
 * modes, and strict referrer policies frequently strip it, causing
 * Nominatim to return "Access denied"). Routing through the server sidesteps
 * that entirely.
 */

import { NextRequest, NextResponse } from "next/server"

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
const USER_AGENT = "Kwanix-RoutePass/1.0 (+https://kwanix.app)"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("mode")

  let upstreamUrl: string
  if (mode === "search") {
    const q = searchParams.get("q")
    if (!q) {
      return NextResponse.json({ error: "Missing q parameter" }, { status: 400 })
    }
    const limit = searchParams.get("limit") ?? "6"
    const countrycodes = searchParams.get("countrycodes")
    upstreamUrl =
      `${NOMINATIM_BASE}/search?q=${encodeURIComponent(q)}&format=json&limit=${encodeURIComponent(limit)}` +
      (countrycodes ? `&countrycodes=${encodeURIComponent(countrycodes)}` : "")
  } else if (mode === "reverse") {
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")
    if (!lat || !lon) {
      return NextResponse.json({ error: "Missing lat/lon parameters" }, { status: 400 })
    }
    upstreamUrl = `${NOMINATIM_BASE}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`
  } else {
    return NextResponse.json({ error: "mode must be 'search' or 'reverse'" }, { status: 400 })
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { "Accept-Language": "en", "User-Agent": USER_AGENT },
      cache: "no-store",
    })
    if (!upstream.ok) {
      return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 502 })
    }
    const data = await upstream.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Could not reach geocoding service" }, { status: 502 })
  }
}
