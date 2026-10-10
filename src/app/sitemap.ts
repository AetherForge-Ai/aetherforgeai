import type { MetadataRoute } from "next";
import { publicTickerPaths } from "@/lib/sitemap-tickers";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

/**
 * Public sitemap. /blog stays off until there are posts.
 * /projections stays off while crypto projections are paused. The page still
 * answers for NZX and ASX tabs. /performance is a dated sample, so it is not
 * listed as daily.
 */
const ENTRIES: Array<{
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
  lastModified: string;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1, lastModified: "2026-10-10" },
  { path: "/about", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/performance", changeFrequency: "yearly", priority: 0.4, lastModified: "2026-07-08" },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-10-10" },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-10" },
  { path: "/markets", changeFrequency: "weekly", priority: 0.8, lastModified: "2026-10-10" },
  { path: "/market-news", changeFrequency: "weekly", priority: 0.7, lastModified: "2026-10-10" },
  { path: "/privacy-policy", changeFrequency: "monthly", priority: 0.4, lastModified: "2026-10-10" },
  { path: "/terms-of-service", changeFrequency: "monthly", priority: 0.4, lastModified: "2026-10-10" },
  { path: "/ai-disclaimer", changeFrequency: "monthly", priority: 0.4, lastModified: "2026-10-10" },
  { path: "/trust", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/docs", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/tax", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-10" },
  { path: "/changelog", changeFrequency: "monthly", priority: 0.3, lastModified: "2026-10-11" },
  { path: "/status", changeFrequency: "weekly", priority: 0.4, lastModified: "2026-10-11" },
  { path: "/stox", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/koins", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/smitty", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-10" },
  { path: "/buy-the-bots", changeFrequency: "monthly", priority: 0.4, lastModified: "2026-10-10" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ENTRIES.map((entry) => ({
    url: `${siteUrl}${entry.path}`,
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
  const tickers = publicTickerPaths().map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: "2026-10-11",
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));
  return [...pages, ...tickers];
}
