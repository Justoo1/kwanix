"use client";

import { useRef, useState } from "react";
import { Printer, ChevronDown } from "lucide-react";
import { type PrintFormat } from "@/lib/print-utils";
import TicketThermalPrint from "./ticket-thermal-print";

interface TicketData {
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
}

export default function TicketPrintMenu(ticket: TicketData) {
  const [open, setOpen] = useState(false);
  const [thermalFormat, setThermalFormat] = useState<PrintFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function selectFormat(fmt: PrintFormat) {
    setOpen(false);
    setThermalFormat(fmt);
  }

  function handleCardPrint() {
    setOpen(false);
    window.print();
  }

  return (
    <div className="relative print:hidden" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[13px] font-semibold text-foreground shadow-sm hover:bg-muted transition-colors"
        title="Print ticket"
      >
        <Printer className="h-4 w-4" />
        Print
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 w-52 rounded-xl border border-border bg-white shadow-lg overflow-hidden">
            <button
              onClick={handleCardPrint}
              className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-muted transition-colors"
            >
              <div className="font-semibold text-foreground">Bus Ticket (Card)</div>
              <div className="text-xs text-muted-foreground">{'5.5" × 2.6" landscape'}</div>
            </button>
            <div className="border-t border-border" />
            <button
              onClick={() => selectFormat("receipt_80")}
              className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-muted transition-colors"
            >
              <div className="font-semibold text-foreground">Thermal Receipt</div>
              <div className="text-xs text-muted-foreground">80mm roll printer</div>
            </button>
            <button
              onClick={() => selectFormat("label_62")}
              className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-muted transition-colors"
            >
              <div className="font-semibold text-foreground">Label (QL-800)</div>
              <div className="text-xs text-muted-foreground">62mm Brother label tape</div>
            </button>
          </div>
        </>
      )}

      {thermalFormat && (
        <TicketThermalPrint
          {...ticket}
          format={thermalFormat}
          onDone={() => setThermalFormat(null)}
        />
      )}
    </div>
  );
}
