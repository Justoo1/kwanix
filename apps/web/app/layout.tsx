import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

import { QueryProvider } from "@/components/providers/query-provider";
import { NetworkProvider } from "@/components/providers/network-provider";
import { PwaRegister } from "@/components/pwa-register";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kwanix",
  description: "Unified Transit Management — Ticketing & Parcel Logistics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <NetworkProvider>
          <QueryProvider>{children}</QueryProvider>
          <Toaster position="top-right" richColors closeButton />
          <PwaRegister />
        </NetworkProvider>
      </body>
    </html>
  );
}
