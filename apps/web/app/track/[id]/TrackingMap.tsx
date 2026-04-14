"use client";

import { useEffect, useRef } from "react";

interface TrackingMapProps {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  originName: string;
  destinationName: string;
  vehicleLat?: number | null;
  vehicleLng?: number | null;
  status: string;
}

export default function TrackingMap({
  originLat,
  originLng,
  destinationLat,
  destinationLng,
  originName,
  destinationName,
  vehicleLat,
  vehicleLng,
  status,
}: TrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamic import to avoid SSR issues
    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const midLat = (originLat + destinationLat) / 2;
      const midLng = (originLng + destinationLng) / 2;

      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false }).setView(
        [midLat, midLng],
        7
      );
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      // Origin marker (green)
      const originIcon = L.divIcon({
        className: "",
        html: `<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([originLat, originLng], { icon: originIcon })
        .addTo(map)
        .bindPopup(`<b>Origin</b><br/>${originName}`);

      // Destination marker (red)
      const destIcon = L.divIcon({
        className: "",
        html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([destinationLat, destinationLng], { icon: destIcon })
        .addTo(map)
        .bindPopup(`<b>Destination</b><br/>${destinationName}`);

      // Route line (dashed)
      L.polyline(
        [
          [originLat, originLng],
          [destinationLat, destinationLng],
        ],
        { color: "#60a5fa", weight: 2, dashArray: "6 4", opacity: 0.7 }
      ).addTo(map);

      // Live vehicle marker (blue bus icon)
      const vehicleCoords: [number, number] | null =
        vehicleLat != null && vehicleLng != null
          ? [vehicleLat, vehicleLng]
          : status === "in_transit"
            ? [
                originLat + (destinationLat - originLat) * 0.4,
                originLng + (destinationLng - originLng) * 0.4,
              ]
            : status === "arrived" || status === "picked_up"
              ? [destinationLat, destinationLng]
              : null;

      if (vehicleCoords) {
        const busIcon = L.divIcon({
          className: "",
          html: `<div style="background:#3b82f6;color:white;font-size:14px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)">🚌</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker(vehicleCoords, { icon: busIcon })
          .addTo(map)
          .bindPopup(status === "in_transit" ? "Bus (estimated position)" : "Bus arrived");
      }

      // Fit map to show both points
      map.fitBounds(
        [
          [originLat, originLng],
          [destinationLat, destinationLng],
        ],
        { padding: [30, 30] }
      );
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
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div ref={mapRef} style={{ height: "220px", width: "100%" }} />
    </>
  );
}
