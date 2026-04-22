"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { type PrintFormat, triggerPrint } from "@/lib/print-utils";

interface ParcelReceiptPrintProps {
  trackingNumber: string;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  originStation: string;
  destinationStation: string;
  weightKg?: number | null;
  feeGhs?: number;
  description?: string | null;
  declaredValueGhs?: number | null;
  format: PrintFormat;
  onDone: () => void;
}

/**
 * 80mm thermal receipt or 62mm QL-800 label for a parcel.
 *
 * Design rules:
 * - All dimensions in mm or pt — never px.
 * - width: 100% so the @page size controls physical width.
 * - QR size: 144px for 62mm tape, 172px for 80mm roll.
 * - Rendered via React portal as a direct <body> child.
 * - triggerPrint() injects the @page override and calls window.print().
 */
export default function ParcelReceiptPrint({
  trackingNumber,
  senderName,
  receiverName,
  receiverPhone,
  originStation,
  destinationStation,
  weightKg,
  feeGhs,
  description,
  declaredValueGhs,
  format,
  onDone,
}: ParcelReceiptPrintProps) {
  useEffect(() => {
    const t = setTimeout(() => {
      triggerPrint(format).then(onDone);
    }, 150);
    return () => clearTimeout(t);
  }, [format, onDone]);

  const now = new Intl.DateTimeFormat("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const qrSize = format === "receipt_80" ? 172 : 144;
  const padding = format === "receipt_80" ? "3mm" : "2mm";
  const trackingUrl = typeof window !== "undefined"
    ? `${window.location.origin}/track/${trackingNumber}`
    : `https://kwanix.app/track/${trackingNumber}`;

  const content = (
    <div
      id="print-root"
      aria-hidden="true"
      style={{
        width: "100%",
        padding,
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
        <div style={{ fontSize: "7pt", color: "#444" }}>Parcel Receipt</div>
      </div>

      <Divider dashed />

      {/* QR Code */}
      <div style={{ textAlign: "center", margin: "2mm 0 1.5mm" }}>
        <QRCodeSVG
          value={trackingUrl}
          size={qrSize}
          level="M"
          style={{ display: "block", margin: "0 auto" }}
        />
      </div>

      {/* Tracking number */}
      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          fontSize: "10pt",
          letterSpacing: "1px",
          marginBottom: "2mm",
          wordBreak: "break-all",
        }}
      >
        {trackingNumber}
      </div>

      <Divider />

      {/* Route */}
      <Section>
        <Row label="FROM" value={originStation} />
        <Row label="TO  " value={destinationStation} bold />
      </Section>

      <Divider />

      {/* Parties */}
      <Section>
        <Row label="SENDER  " value={senderName} />
        <Row label="RECEIVER" value={receiverName} bold />
        <Row label="PHONE   " value={receiverPhone} />
      </Section>

      {(weightKg != null || feeGhs != null || description || declaredValueGhs != null) && (
        <>
          <Divider dashed />
          <Section>
            {weightKg != null && <Row label="WEIGHT" value={`${weightKg} kg`} />}
            {feeGhs != null && (
              <Row label="FEE   " value={`GHS ${Number(feeGhs).toFixed(2)}`} bold />
            )}
            {format === "receipt_80" && declaredValueGhs != null && (
              <Row label="DECLARED" value={`GHS ${Number(declaredValueGhs).toFixed(2)}`} />
            )}
            {format === "receipt_80" && description && (
              <Row label="DESC  " value={description} />
            )}
          </Section>
        </>
      )}

      <Divider />

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: "7pt", color: "#555" }}>
        <div>{now}</div>
        <div style={{ marginTop: "1mm" }}>Scan QR to track your parcel</div>
        <div>kwanix.app/track</div>
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
