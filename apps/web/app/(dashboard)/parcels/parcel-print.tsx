"use client";

import { QRCodeSVG } from "qrcode.react";

interface ParcelPrintProps {
  trackingNumber: string;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  originStation: string;
  destinationStation: string;
  weightKg?: number | null;
  feeGhs?: number;
}

/**
 * 58mm thermal roll label.
 *
 * Design rules:
 * - All dimensions in mm or pt — never px — so the browser maps 1:1 to
 *   the physical roll regardless of screen DPI.
 * - @page margin is 0 so content fills the full 58mm roll width.
 * - The root div is padded 2mm on each side → 54mm usable width.
 * - QR code is 38mm × 38mm — large enough to scan reliably.
 * - Font sizes in pt: 9pt body, 11pt headings, 7pt footer.
 * - colour-adjust: exact ensures ink is not stripped by the browser.
 */
export default function ParcelPrint({
  trackingNumber,
  senderName,
  receiverName,
  receiverPhone,
  originStation,
  destinationStation,
  weightKg,
  feeGhs,
}: ParcelPrintProps) {
  const now = new Intl.DateTimeFormat("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <div
      id="parcel-print-root"
      aria-hidden="true"
      style={{
        /* Rendered as a direct <body> child via React portal.
           globals.css hides it on screen (display:none) and reveals it
           at print time (display:block), so the page collapses to the
           exact receipt height with no blank space below. */
        width: "54mm",
        padding: "2mm",
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
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: "1.5mm" }}>
        <div style={{ fontWeight: "bold", fontSize: "12pt", letterSpacing: "2px" }}>
          ROUTEPASS
        </div>
        <div style={{ fontSize: "7pt", color: "#444" }}>Parcel Receipt</div>
      </div>

      <Divider dashed />

      {/* ── QR Code ────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", margin: "2mm 0 1.5mm" }}>
        <QRCodeSVG
          value={trackingNumber}
          size={144}          /* rendered at 144px; @page maps this to ~38mm */
          level="M"
          style={{ display: "block", margin: "0 auto" }}
        />
      </div>

      {/* Tracking number below QR */}
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

      {/* ── Route ──────────────────────────────────────────────── */}
      <Section>
        <Row label="FROM" value={originStation} />
        <Row label="TO  " value={destinationStation} bold />
      </Section>

      <Divider />

      {/* ── Parties ────────────────────────────────────────────── */}
      <Section>
        <Row label="SENDER  " value={senderName} />
        <Row label="RECEIVER" value={receiverName} bold />
        <Row label="PHONE   " value={receiverPhone} />
      </Section>

      {(weightKg != null || feeGhs != null) && (
        <>
          <Divider dashed />
          <Section>
            {weightKg != null && <Row label="WEIGHT" value={`${weightKg} kg`} />}
            {feeGhs != null && (
              <Row label="FEE   " value={`GHS ${Number(feeGhs).toFixed(2)}`} bold />
            )}
          </Section>
        </>
      )}

      <Divider />

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", fontSize: "7pt", color: "#555" }}>
        <div>{now}</div>
        <div style={{ marginTop: "1mm" }}>Scan QR to track your parcel</div>
        <div>routepass.app/track</div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
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
      <span style={{ color: "#555", whiteSpace: "nowrap", flexShrink: 0 }}>
        {label}:
      </span>
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
