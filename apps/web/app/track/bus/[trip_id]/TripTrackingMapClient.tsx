"use client";

import dynamic from "next/dynamic";

// Leaflet requires browser APIs — must be dynamically imported with ssr: false.
const TripTrackingMap = dynamic(() => import("./TripTrackingMap"), { ssr: false });

export default TripTrackingMap;
