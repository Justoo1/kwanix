"use client";

import { useEffect, useRef } from "react";

export interface FleetVehicle {
  vehicle_id: number;
  plate_number: string;
  trip_id: number | null;
  trip_status: string | null;
  route: string | null;
  lat: number;
  lng: number;
  last_update: string;
  is_stale: boolean;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_lat: number | null;
  dest_lng: number | null;
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

      const map = L.map(mapRef.current!, {
        zoomControl: true,
        attributionControl: false,
      }).setView([7.9465, -1.0232], 7);

      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const bounds: [number, number][] = [];

      vehicles.forEach((v) => {
        const isLive = !v.is_stale;
        const pinColor = isLive ? "#008A56" : "#F59E0B";
        const pulseColor = isLive ? "#4ECDA4" : "#FDE68A";

        // ── Route polyline (origin → vehicle → destination) ──────────
        const hasOrigin = v.origin_lat != null && v.origin_lng != null;
        const hasDest = v.dest_lat != null && v.dest_lng != null;

        if (hasOrigin) {
          // Origin station marker (green dot)
          const originIcon = L.divIcon({
            className: "",
            html: `<div style="background:#22c55e;width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          L.marker([v.origin_lat!, v.origin_lng!], { icon: originIcon })
            .addTo(map)
            .bindPopup(`<b>Origin</b><br/>${v.route?.split(" → ")[0] ?? ""}`);
          bounds.push([v.origin_lat!, v.origin_lng!]);
        }

        if (hasDest) {
          // Destination station marker (red dot)
          const destIcon = L.divIcon({
            className: "",
            html: `<div style="background:#ef4444;width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          L.marker([v.dest_lat!, v.dest_lng!], { icon: destIcon })
            .addTo(map)
            .bindPopup(`<b>Destination</b><br/>${v.route?.split(" → ")[1] ?? ""}`);
          bounds.push([v.dest_lat!, v.dest_lng!]);
        }

        // Route line: origin → vehicle position → destination
        if (hasOrigin && hasDest) {
          L.polyline(
            [
              [v.origin_lat!, v.origin_lng!],
              [v.lat, v.lng],
              [v.dest_lat!, v.dest_lng!],
            ],
            { color: pinColor, weight: 2.5, dashArray: "7 5", opacity: 0.65 }
          ).addTo(map);
        } else if (hasOrigin) {
          L.polyline(
            [[v.origin_lat!, v.origin_lng!], [v.lat, v.lng]],
            { color: pinColor, weight: 2, dashArray: "5 4", opacity: 0.5 }
          ).addTo(map);
        }

        // ── Bus marker ────────────────────────────────────────────────
        const lastUpdateFmt = v.last_update
          ? new Date(v.last_update).toLocaleTimeString("en-GH", { timeStyle: "short" })
          : "Unknown";

        const busHtml = `
          <div style="position:relative;width:30px;height:30px">
            <div style="
              background:${pinColor};color:white;font-size:14px;
              width:30px;height:30px;border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);
              position:relative;z-index:2
            ">🚌</div>
            ${isLive ? `<div style="
              position:absolute;inset:-6px;border-radius:50%;
              border:2px solid ${pulseColor};opacity:0.5;
              animation:ping 1.5s ease-out infinite
            "></div>` : ""}
          </div>
        `;

        const busIcon = L.divIcon({
          className: "",
          html: busHtml,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const popup = `
          <div style="min-width:160px;font-family:inherit">
            <div style="font-weight:700;font-size:13px;color:#0D1F17;margin-bottom:4px">${v.plate_number}</div>
            <div style="font-size:12px;color:#4A5E50;margin-bottom:4px">${v.route ?? "No active route"}</div>
            <div style="font-size:11px;color:${isLive ? "#008A56" : "#F59E0B"};font-weight:600;margin-bottom:6px">
              ${isLive ? "● Live GPS" : "⚠ Stale GPS"} · ${lastUpdateFmt}
            </div>
            ${v.trip_id ? `<a href="/trips/${v.trip_id}" style="font-size:11px;color:#4A90D9;font-weight:600">View trip →</a>` : ""}
          </div>
        `;

        L.marker([v.lat, v.lng], { icon: busIcon })
          .addTo(map)
          .bindPopup(popup);

        bounds.push([v.lat, v.lng]);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }

      // Inject ping keyframes once
      if (!document.getElementById("kwanix-ping-style")) {
        const style = document.createElement("style");
        style.id = "kwanix-ping-style";
        style.textContent = `@keyframes ping{0%{transform:scale(1);opacity:0.5}100%{transform:scale(1.8);opacity:0}}`;
        document.head.appendChild(style);
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
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
    </>
  );
}
