"use client";

import { useEffect, useRef, useState } from "react";
import { X, MapPin, Search, Loader2 } from "lucide-react";

interface Props {
  initialLat?: number;
  initialLng?: number;
  onSelect: (lat: string, lng: string, label: string) => void;
  onClose: () => void;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

// Ghana bounding box centre
const GHANA_CENTER: [number, number] = [7.9465, -1.0232];
const GHANA_ZOOM = 7;
const SEARCH_DEBOUNCE_MS = 400;

export default function StationMapPicker({ initialLat, initialLng, onSelect, onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [picked, setPicked] = useState<{ lat: string; lng: string; label: string } | null>(
    initialLat && initialLng
      ? { lat: initialLat.toFixed(6), lng: initialLng.toFixed(6), label: "" }
      : null
  );
  const [reverseLoading, setReverseLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(`/api/geocode?mode=reverse&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      return (data.display_name as string) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  // Debounced place-name search, biased to Ghana since that's where all stations are.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (query.trim().length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geocode?mode=search&q=${encodeURIComponent(query)}&limit=6&countrycodes=gh`
        );
        const data = (await res.json()) as SearchResult[];
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query]);

  /** Attach the shared drag handler to a marker instance. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function attachDragHandler(m: any) {
    m.on("dragend", async () => {
      const pos = m.getLatLng();
      setReverseLoading(true);
      const label = await reverseGeocode(pos.lat, pos.lng);
      setReverseLoading(false);
      setPicked({ lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6), label });
    });
  }

  function selectSearchResult(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const L = leafletRef.current;
    const map = mapInstanceRef.current as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!L || !map) return;

    map.setView([lat, lng], 16);
    if (markerRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (markerRef.current as any).setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerRef.current = m;
      attachDragHandler(m);
    }

    setPicked({ lat: lat.toFixed(6), lng: lng.toFixed(6), label: result.display_name });
    setQuery("");
    setSearchResults([]);
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Guard against React Strict Mode's double effect-invocation in dev:
    // the dynamic import is async, so a stale invocation's callback could
    // still resolve and try to re-initialize the (already-removed-or-not-yet-
    // created) map on the same DOM node, which Leaflet rejects outright.
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || mapInstanceRef.current || !mapRef.current) return;
      leafletRef.current = L;
      // Fix default icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Load Leaflet CSS
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const center: [number, number] =
        initialLat && initialLng ? [initialLat, initialLng] : GHANA_CENTER;
      const zoom = initialLat && initialLng ? 14 : GHANA_ZOOM;

      const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, zoom);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      // Place initial marker if coords provided
      if (initialLat && initialLng) {
        const m = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
        markerRef.current = m;
        attachDragHandler(m);
      }

      // Click to place/move marker
      map.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;

        if (markerRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (markerRef.current as any).setLatLng([lat, lng]);
        } else {
          const m = L.marker([lat, lng], { draggable: true }).addTo(map);
          markerRef.current = m;
          attachDragHandler(m);
        }

        setReverseLoading(true);
        const label = await reverseGeocode(lat, lng);
        setReverseLoading(false);
        setPicked({ lat: lat.toFixed(6), lng: lng.toFixed(6), label });
      });
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapInstanceRef.current as any).remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Pick location on map</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Search for a place, or click anywhere on the map to drop a pin. You can also drag the pin to adjust.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Location search — z-index must clear Leaflet's internal panes/controls
            (which go up to z-index ~1000), otherwise the map paints over the dropdown. */}
        <div className="relative z-1000 px-5 py-3 border-b border-zinc-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a place or address…"
              className="w-full rounded-lg border border-zinc-300 pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 animate-spin" />
            )}
          </div>

          {searchResults.length > 0 && (
            <ul className="absolute left-5 right-5 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
              {searchResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => selectSearchResult(r)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                    <span className="truncate text-zinc-700">{r.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Map */}
        <div ref={mapRef} style={{ height: 380 }} className="w-full" />

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-200 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {picked ? (
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono">
                    {picked.lat}, {picked.lng}
                  </span>
                </div>
                {reverseLoading ? (
                  <p className="text-xs text-zinc-400 mt-0.5">Identifying location…</p>
                ) : picked.label ? (
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{picked.label}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No location selected — click the map</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!picked}
              onClick={() => {
                if (picked) onSelect(picked.lat, picked.lng, picked.label);
              }}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              Use this location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
