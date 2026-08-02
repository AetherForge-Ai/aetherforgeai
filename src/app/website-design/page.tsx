import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { WebsiteDesignClient } from "@/components/website-design/WebsiteDesignClient";

/**
 * Standalone "Website Design" services landing page.
 *
 * This page deliberately has its OWN visual identity — a warm, editorial,
 * high-end design-studio aesthetic (creams, warm ivory, champagne gold, deep
 * charcoal) that is intentionally unrecognisable from the rest of AetherForge.
 * It loads its own serif + geometric-sans typeface pair so nothing about the
 * type, colour or spacing echoes the trading platform.
 */

// Elegant editorial serif for display headings.
const displaySerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-studio-serif",
  display: "swap",
});

// Refined geometric sans for body + UI.
const bodySans = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-studio-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Website Design — Bespoke Websites, Portals & AI, Crafted to Convert",
  description:
    "Premium website design for businesses that want to look world-class. Polished multi-page sites, secure customer portals, integrated AI chatbots and advanced custom builds — designed and coded to a studio standard.",
  openGraph: {
    title: "Website Design — Bespoke Websites, Portals & AI",
    description:
      "Premium, results-driven website design. From polished company sites to secure portals, custom Python AI bots and fully bespoke builds.",
    type: "website",
  },
};

export default function WebsiteDesignPage() {
  return (
    <div className={`${displaySerif.variable} ${bodySans.variable}`}>
      <WebsiteDesignClient />
    </div>
  );
}
