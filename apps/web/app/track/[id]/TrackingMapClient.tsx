"use client";

import dynamic from "next/dynamic";

// Leaflet requires browser APIs — must be dynamically imported with ssr: false.
// This wrapper is a Client Component so next/dynamic with ssr: false is allowed.
const TrackingMap = dynamic(() => import("./TrackingMap"), { ssr: false });

export default TrackingMap;
