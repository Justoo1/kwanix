"use client";

import { useActionState, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { createStation, type CreateStationState } from "./actions";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export default function CreateStationForm() {
  const [state, action, pending] = useActionState<CreateStationState, FormData>(
    createStation,
    undefined
  );

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Read name + address from DOM to use as geocoding query
  async function handleGeocode() {
    setGeocodeError(null);
    const nameEl = document.getElementById("station-name") as HTMLInputElement | null;
    const addressEl = document.getElementById("station-address") as HTMLInputElement | null;
    const query = [nameEl?.value, addressEl?.value, "Ghana"].filter(Boolean).join(", ");

    if (!query.trim()) {
      setGeocodeError("Enter a station name or address first.");
      return;
    }

    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const results: NominatimResult[] = await res.json();
      if (results.length === 0) {
        setGeocodeError("Location not found. Try a more specific address.");
      } else {
        setLat(parseFloat(results[0].lat).toFixed(6));
        setLng(parseFloat(results[0].lon).toFixed(6));
      }
    } catch {
      setGeocodeError("Could not reach geocoding service. Enter coordinates manually.");
    } finally {
      setGeocoding(false);
    }
  }

  if (state !== undefined && !state?.error) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-sm font-medium text-emerald-600">Station created!</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-blue-600 hover:underline"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Station name
          </label>
          <input
            id="station-name"
            name="name"
            type="text"
            required
            placeholder="Accra — Neoplan"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Location code <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="location_code"
            type="text"
            maxLength={10}
            placeholder="ACC"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Contact number <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="contact_number"
            type="tel"
            placeholder="233302123456"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Address <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            id="station-address"
            name="address"
            type="text"
            placeholder="Ring Road, Accra"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
      </div>

      {/* Map coordinates */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-700">Map coordinates</p>
            <p className="text-xs text-zinc-400">
              Used for route map on the public tracking page.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGeocode}
            disabled={geocoding}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            {geocoding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <MapPin className="h-3 w-3" />
            )}
            {geocoding ? "Detecting…" : "Auto-detect"}
          </button>
        </div>

        {geocodeError && (
          <p className="text-xs text-amber-600">{geocodeError}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Latitude</label>
            <input
              name="latitude"
              type="number"
              step="0.000001"
              min="-90"
              max="90"
              placeholder="5.603717"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Longitude</label>
            <input
              name="longitude"
              type="number"
              step="0.000001"
              min="-180"
              max="180"
              placeholder="-0.186964"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="is_hub"
            value="true"
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
          />
          <span className="text-sm text-zinc-700">Hub station</span>
        </label>
        <span className="text-xs text-zinc-400">(central depot for parcel collection)</span>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating…" : "Create station"}
        </button>
      </div>
    </form>
  );
}
