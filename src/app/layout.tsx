// src/app/layout.tsx
import React from "react";
import type { Metadata, Viewport } from "next";
import { Sora, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { headers } from "next/headers";
import { DocumentSessionProvider } from "@/components/DocumentSession";
import { ScriptExecutor } from "@/components/ScriptExecutor";
import { DevToolsHandler } from "@/components/DevToolsHandler";
import { GlobalErrorCatcher } from "@/components/GlobalErrorCatcher";
import { GoogleTag } from "@/components/GoogleTag";
import { AnalyticsNotice } from "@/components/AnalyticsNotice";
import { SiteFooter } from "@/components/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
import { PortfolioCoach } from "@/components/portfolio-coach";
import { TransactionDialogHost } from "@/components/dashboard/TransactionDialogHost";

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
  title: "AetherForge AI — Intelligent Market Analysis",
  description:
    "AetherForge AI is market intelligence for a paper portfolio: NZX, ASX and global markets, with AI research on the positions you enter. Not a broker, and not financial advice.",
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
      "Market intelligence for NZX, ASX and global markets, from FORGE INTELLIGENCE LIMITED, a New Zealand limited company.",
    images: [{ url: "/brand/og-1200x630.png", width: 1200, height: 630, alt: "AetherForge AI" }],
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
  themeColor: "#f8fafc",
};

// SUPER IMPORTANT: NOT EDIT THE FOLLOWING 2 LINES TO FORCE NEXT.JS TO RENDER DYNAMICALLY
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Missing or non-member is guest. Fail closed: a document that did not
  // present a session cookie cannot paint identity anywhere in the tree.
  const headerList = await headers();
  const sessionMode = headerList.get("x-af-doc") === "member" ? "member" : "guest";
  return (
    <html lang="en">
      <body
        className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <DocumentSessionProvider mode={sessionMode}>
          {/* Google tag (gtag.js) — injected on every page/route */}
          <GoogleTag />
          <GlobalErrorCatcher />
          <ScriptExecutor />
          <DevToolsHandler />
          <div className="min-h-screen flex flex-col">
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
          <AnalyticsNotice />
          <PortfolioCoach />
          {/* Single Buy/Add host for every dashboard subpage. Lives outside
              PortfolioDashboard so the stocks hub's live-price hydrate cannot
              remount the dialog mid ticker-search. */}
          <TransactionDialogHost />
          <Toaster position="top-center" richColors />
        </DocumentSessionProvider>
      </body>
    </html>
  );
}
