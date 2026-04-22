"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { type PrintFormat, triggerPrint } from "@/lib/print-utils";

interface TicketThermalPrintProps {
  ticketId: number;
  ticketUrl: string;
  passengerName: string;
  passengerPhone: string;
  seatNumber: number;
  fareGhs: number;
  status: string;
  paymentStatus: string;
  departureStation: string | null;
  destinationStation: string | null;
  departureTime: string | null;
  vehiclePlate: string | null;
  companyName: string | null;
  format: PrintFormat;
  onDone: () => void;
}

/**
 * Thermal receipt / QL-800 label for a passenger ticket.
 *
 * Design rules (same as parcel-print.tsx):
 * - All dimensions in mm or pt — never px.
 * - width: 100% so the @page size controls physical width.
 * - QR size: 144px for 62mm tape, 172px for 80mm roll.
 * - Rendered via React portal as a direct <body> child.
 * - globals.css keeps #print-root hidden on screen; triggerPrint()
 *   injects the @page override and calls window.print().
 */
export default function TicketThermalPrint({
  ticketId,
  ticketUrl,
  passengerName,
  passengerPhone,
  seatNumber,
  fareGhs,
  status,
  paymentStatus,
  departureStation,
  destinationStation,
  departureTime,
  vehiclePlate,
  companyName,
  format,
  onDone,
}: TicketThermalPrintProps) {
  useEffect(() => {
    const t = setTimeout(() => {
      triggerPrint(format).then(onDone);
    }, 150);
    return () => clearTimeout(t);
  }, [format, onDone]);

  const departure = departureTime ? new Date(departureTime) : null;
  const dateStr = departure
    ? departure.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const timeStr = departure
    ? departure.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const qrSize = format === "receipt_80" ? 172 : 144;
  const isPaid = paymentStatus === "paid";

  const content = (
    <div
      id="print-root"
      aria-hidden="true"
      style={{
        width: "100%",
        padding: format === "receipt_80" ? "3mm" : "2mm",
        boxSizing: "border-box",
        background: "#fff",
        color: "#000",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "9pt",
        lineHeight: "1.35",
        colorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1.5mm" }}>
        <div style={{ fontWeight: "bold", fontSize: "12pt", letterSpacing: "2px" }}>
          KWANIX
        </div>
        {companyName && companyName !== "Kwanix" && (
          <div style={{ fontSize: "8pt", color: "#444" }}>{companyName}</div>
        )}
        <div style={{ fontSize: "7pt", color: "#444" }}>Passenger Ticket</div>
      </div>

      <Divider dashed />

      {/* QR Code */}
      <div style={{ textAlign: "center", margin: "2mm 0 1.5mm" }}>
        <QRCodeSVG
          value={ticketUrl}
          size={qrSize}
          level="M"
          style={{ display: "block", margin: "0 auto" }}
        />
      </div>

      {/* Ticket ID */}
      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          fontSize: "10pt",
          letterSpacing: "1px",
          marginBottom: "2mm",
        }}
      >
        Ticket #{String(ticketId).padStart(8, "0")}
      </div>

      <Divider />

      {/* Route */}
      <Section>
        <Row label="FROM" value={departureStation ?? "—"} />
        <Row label="TO  " value={destinationStation ?? "—"} bold />
        <Row label="DATE" value={dateStr} />
        <Row label="TIME" value={timeStr} />
        {vehiclePlate && <Row label="BUS " value={vehiclePlate} />}
      </Section>

      <Divider />

      {/* Passenger */}
      <Section>
        <Row label="PASSENGER" value={passengerName} bold />
        {passengerPhone && <Row label="PHONE    " value={passengerPhone} />}
        <Row label="SEAT     " value={String(seatNumber)} bold />
        <Row label="FARE     " value={`GHS ${Number(fareGhs).toFixed(2)}`} bold />
        <Row
          label="PAYMENT  "
          value={isPaid ? "PAID ✓" : paymentStatus.toUpperCase()}
        />
      </Section>

      <Divider />

      {/* Ticket status */}
      <div
        style={{
          textAlign: "center",
          fontSize: "8pt",
          fontWeight: "bold",
          letterSpacing: "1px",
          marginBottom: "1.5mm",
          color: status === "valid" ? "#000" : "#777",
        }}
      >
        {status.toUpperCase()}
      </div>

      <Divider dashed />

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: "7pt", color: "#555" }}>
        <div>Present this receipt at boarding</div>
        <div style={{ marginTop: "1mm" }}>kwanix.app</div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function Divider({ dashed }: { dashed?: boolean }) {
  return (
    <div
      style={{
        borderTop: dashed ? "1px dashed #999" : "1px solid #000",
        margin: "1.5mm 0",
      }}
    />
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: "0.5mm" }}>{children}</div>;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "2mm",
        marginBottom: "0.8mm",
      }}
    >
      <span style={{ color: "#555", whiteSpace: "nowrap", flexShrink: 0 }}>{label}:</span>
      <span
        style={{
          fontWeight: bold ? "bold" : "normal",
          textAlign: "right",
          wordBreak: "break-word",
          flex: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}
