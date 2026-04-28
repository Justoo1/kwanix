"use client";

import { useEffect, useRef } from "react";

interface TripTrackingMapProps {
  departureLat: number | null;
  departureLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  vehicleLat: number | null;
  vehicleLng: number | null;
  departureStationName: string;
  destinationStationName: string;
  tripStatus: string;
}

export default function TripTrackingMap({
  departureLat,
  departureLng,
  destinationLat,
  destinationLng,
  vehicleLat,
  vehicleLng,
  departureStationName,
  destinationStationName,
  tripStatus,
}: TripTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const busMarkerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

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

      const hasStationCoords =
        departureLat != null && departureLng != null &&
        destinationLat != null && destinationLng != null;

      const centerLat = hasStationCoords
        ? (departureLat! + destinationLat!) / 2
        : vehicleLat ?? 5.6;   // Ghana centroid fallback
      const centerLng = hasStationCoords
        ? (departureLng! + destinationLng!) / 2
        : vehicleLng ?? -0.19;

      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false }).setView(
        [centerLat, centerLng],
        7
      );
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const boundsPoints: [number, number][] = [];

      if (hasStationCoords) {
        // Origin marker (green)
        const originIcon = L.divIcon({
          className: "",
          html: `<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([departureLat!, departureLng!], { icon: originIcon })
          .addTo(map)
          .bindPopup(`<b>Departure</b><br/>${departureStationName}`);
        boundsPoints.push([departureLat!, departureLng!]);

        // Destination marker (red)
        const destIcon = L.divIcon({
          className: "",
          html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([destinationLat!, destinationLng!], { icon: destIcon })
          .addTo(map)
          .bindPopup(`<b>Destination</b><br/>${destinationStationName}`);
        boundsPoints.push([destinationLat!, destinationLng!]);

        // Route line (dashed)
        L.polyline(
          [[departureLat!, departureLng!], [destinationLat!, destinationLng!]],
          { color: "#60a5fa", weight: 2, dashArray: "6 4", opacity: 0.7 }
        ).addTo(map);
      }

      // Bus marker
      const busIcon = L.divIcon({
        className: "",
        html: `<div style="background:#3b82f6;color:white;font-size:14px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5)">🚌</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      if (vehicleLat != null && vehicleLng != null) {
        const busMarker = L.marker([vehicleLat, vehicleLng], { icon: busIcon })
          .addTo(map)
          .bindPopup(`<b>Bus</b><br/>${departureStationName} → ${destinationStationName}`);
        busMarkerRef.current = busMarker;
        boundsPoints.push([vehicleLat, vehicleLng]);
      } else if (tripStatus === "departed" && hasStationCoords) {
        // Estimated midpoint if no GPS yet
        const midLat = departureLat! + (destinationLat! - departureLat!) * 0.4;
        const midLng = departureLng! + (destinationLng! - departureLng!) * 0.4;
        L.marker([midLat, midLng], { icon: busIcon })
          .addTo(map)
          .bindPopup("Bus (estimated position — GPS not available)");
      }

      if (boundsPoints.length >= 2) {
        map.fitBounds(boundsPoints, { padding: [30, 30] });
      } else if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 12);
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapInstanceRef.current as any).remove();
        mapInstanceRef.current = null;
        busMarkerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} style={{ height: "280px", width: "100%" }} />
    </>
  );
}
