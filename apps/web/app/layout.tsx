import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

import { QueryProvider } from "@/components/providers/query-provider";
import { NetworkProvider } from "@/components/providers/network-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RoutePass",
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
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <NetworkProvider>
          <QueryProvider>{children}</QueryProvider>
          <Toaster position="top-right" richColors closeButton />
        </NetworkProvider>
      </body>
    </html>
  );
}
