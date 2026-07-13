// src/app/layout.tsx
import React from "react";
import type { Metadata, Viewport } from "next";
import { Sora, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ScriptExecutor } from "@/components/ScriptExecutor";
import { DevToolsHandler } from "@/components/DevToolsHandler";
import { GlobalErrorCatcher } from "@/components/GlobalErrorCatcher";
import { Toaster } from "@/components/ui/sonner";

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});
const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-custom",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Canonical public site URL. Uses the configured app URL when present, otherwise
// the production custom domain — so Open Graph / canonical links resolve absolutely.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  title: "AetherForge AI — Intelligent Market Analysis",
  description:
    "AetherForge AI delivers intelligent market analysis: track your portfolio, measure gains and losses in real time, and get AI-powered research on every position. Professional-grade investing insight.",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/aetherforge-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/aetherforge-icon-512.png" }],
  },
  openGraph: {
    title: "AetherForge AI — Intelligent Market Analysis",
    description:
      "New Zealand–owned market intelligence for NZX, ASX and global markets. Track your portfolio and get AI-powered research on every position.",
    images: [{ url: "/brand/aetherforge-icon-512.png", width: 512, height: 512, alt: "AetherForge AI" }],
    type: "website",
    url: siteUrl,
    siteName: "AetherForge AI",
  },
};

// Mobile viewport — makes the app scale correctly on phones. We keep pinch-to-zoom
// enabled (no maximumScale / userScalable:false) for accessibility, and use
// viewportFit "cover" so the layout extends nicely into notch / safe-area insets.
// This does NOT affect the desktop experience.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#22252d",
};

// SUPER IMPORTANT: NOT EDIT THE FOLLOWING 2 LINES TO FORCE NEXT.JS TO RENDER DYNAMICALLY
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <GlobalErrorCatcher />
        <ScriptExecutor />
        <DevToolsHandler />
        <div className="min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>
        </div>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
