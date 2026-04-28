"use client";

import dynamic from "next/dynamic";

export type { FleetVehicle } from "./FleetMap";

const FleetMap = dynamic(() => import("./FleetMap"), { ssr: false });

export default FleetMap;
