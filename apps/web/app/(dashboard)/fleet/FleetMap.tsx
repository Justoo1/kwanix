"use client";

import { useEffect, useRef } from "react";

interface FleetVehicle {
  vehicle_id: number;
  plate_number: string;
  trip_id: number | null;
  trip_status: string | null;
  route: string | null;
  lat: number;
  lng: number;
  last_update: string;
  is_stale: boolean;
}

interface FleetMapProps {
  vehicles: FleetVehicle[];
}

export default function FleetMap({ vehicles }: FleetMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Default center: Ghana
      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false }).setView(
        [7.9465, -1.0232],
        7
      );
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const bounds: [number, number][] = [];

      vehicles.forEach((v) => {
        const color = v.is_stale ? "#f97316" : "#3b82f6";
        const busIcon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:white;font-size:13px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5)" title="${v.plate_number}">🚌</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const lastUpdateFmt = v.last_update
          ? new Date(v.last_update).toLocaleTimeString("en-GH", { timeStyle: "short" })
          : "Unknown";

        const popupContent = `
          <div style="min-width:140px">
            <b>${v.plate_number}</b><br/>
            ${v.route ?? "No active route"}<br/>
            <span style="color:${v.is_stale ? "#f97316" : "#22c55e"};font-size:11px">
              ${v.is_stale ? "⚠ Stale GPS" : "● Live"} · ${lastUpdateFmt}
            </span>
            ${v.trip_id ? `<br/><a href="/trips/${v.trip_id}" style="font-size:11px;color:#60a5fa">View Trip →</a>` : ""}
          </div>
        `;

        L.marker([v.lat, v.lng], { icon: busIcon })
          .addTo(map)
          .bindPopup(popupContent);

        bounds.push([v.lat, v.lng]);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapInstanceRef.current as any).remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} style={{ height: "440px", width: "100%" }} />
    </>
  );
}
