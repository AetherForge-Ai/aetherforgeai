// src/app/layout.tsx
// Sora, Manrope, and JetBrains Mono are latin variable woff2 files under the
// SIL Open Font Licence, Version 1.1. The licence text for each face is shipped
// beside the file: src/app/fonts/sora-OFL.txt, manrope-OFL.txt, and
// jetbrains-mono-OFL.txt. The build does not fetch fonts.googleapis.com.
import React from "react";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { headers } from "next/headers";
import { DocumentSessionProvider } from "@/components/DocumentSession";
import { ScriptExecutor } from "@/components/ScriptExecutor";
import { DevToolsHandler } from "@/components/DevToolsHandler";
import { GlobalErrorCatcher } from "@/components/GlobalErrorCatcher";
import { GoogleTag } from "@/components/GoogleTag";
import { CONSENT_DEFAULT_DENIED_SNIPPET } from "@/lib/analytics-consent";
import { AnalyticsNotice } from "@/components/AnalyticsNotice";
import { SiteFooter } from "@/components/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
import { PortfolioCoach } from "@/components/portfolio-coach";
import { TransactionDialogHost } from "@/components/dashboard/TransactionDialogHost";
import { LEGAL_ENTITY_NAME, NZBN } from "@/lib/company";

// pull-check:fonts-local-2026-10-11
const sora = localFont({
  src: "./fonts/sora-latin.woff2",
  variable: "--font-display",
  weight: "500 800",
  display: "swap",
});
const manrope = localFont({
  src: "./fonts/manrope-latin.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "swap",
});
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  variable: "--font-mono-custom",
  weight: "400 600",
  display: "swap",
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
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/aetherforge-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/aetherforge-icon-512.png" }],
  },
  manifest: "/site.webmanifest",
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
    <html lang="en-NZ">
      <body
        className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: LEGAL_ENTITY_NAME,
              identifier: NZBN,
              url: siteUrl,
              logo: `${siteUrl}/brand/forge-intelligence-logo.png`,
            }),
          }}
        />
        <DocumentSessionProvider mode={sessionMode}>
          {/* Consent Mode v2 starts denied. This script does not load gtag.js. */}
          <Script id="gtag-consent-default" strategy="beforeInteractive">
            {CONSENT_DEFAULT_DENIED_SNIPPET}
          </Script>
          <GoogleTag />
          <GlobalErrorCatcher />
          <ScriptExecutor />
          <DevToolsHandler />
          <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip">
            <a
              href="#main"
              className="absolute left-4 top-4 z-[100] -translate-y-24 rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground shadow focus:translate-y-0"
            >
              Skip to content
            </a>
            {/* pull-check:batch1-2026-10-11 B1-13 */}
            <main id="main" className="min-w-0 flex-1">{children}</main>
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
