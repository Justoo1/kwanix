"use client";

import { useEffect, useRef, useState } from "react";
import { X, MapPin } from "lucide-react";

interface Props {
  initialLat?: number;
  initialLng?: number;
  onSelect: (lat: string, lng: string, label: string) => void;
  onClose: () => void;
}

// Ghana bounding box centre
const GHANA_CENTER: [number, number] = [7.9465, -1.0232];
const GHANA_ZOOM = 7;

export default function StationMapPicker({ initialLat, initialLng, onSelect, onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  const [picked, setPicked] = useState<{ lat: string; lng: string; label: string } | null>(
    initialLat && initialLng
      ? { lat: initialLat.toFixed(6), lng: initialLng.toFixed(6), label: "" }
      : null
  );
  const [reverseLoading, setReverseLoading] = useState(false);

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      return (data.display_name as string) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
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
        m.on("dragend", async () => {
          const pos = m.getLatLng();
          setReverseLoading(true);
          const label = await reverseGeocode(pos.lat, pos.lng);
          setReverseLoading(false);
          setPicked({ lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6), label });
        });
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
          m.on("dragend", async () => {
            const pos = (m as { getLatLng: () => { lat: number; lng: number } }).getLatLng();
            setReverseLoading(true);
            const lbl = await reverseGeocode(pos.lat, pos.lng);
            setReverseLoading(false);
            setPicked({ lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6), label: lbl });
          });
        }

        setReverseLoading(true);
        const label = await reverseGeocode(lat, lng);
        setReverseLoading(false);
        setPicked({ lat: lat.toFixed(6), lng: lng.toFixed(6), label });
      });
    });

    return () => {
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
              Click anywhere on the map to drop a pin. You can also drag the pin to adjust.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
            <X className="h-5 w-5" />
          </button>
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
