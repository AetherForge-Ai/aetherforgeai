import type { MetadataRoute } from "next";
import { publicTickerPaths } from "@/lib/sitemap-tickers";
import { COMPARISONS, GUIDES } from "@/data/learn-content";
import { DOCS_GUIDES } from "@/lib/docs-guides";
import { LEGAL_PAGES, latestLegalVersion, legalStampToIso, type LegalPageKey } from "@/lib/legal-history";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

/**
 * Public sitemap. /blog stays off and noindex until there are posts.
 * /my-returns is the signed-in return calculator, so it is not listed.
 * /projections is a signed-in member page, so it stays off this list and noindex.
 * /performance is a dated sample, so it is not listed as daily.
 * Docs guides come from DOCS_GUIDES, the same list the /docs index renders.
 * Legal lastmod is the date LegalShell prints (latestLegalVersion), not a second copy.
 * /markets, /market-news and the ticker pages are live prices. lastmod is
 * omitted: a build date would claim the page changed on deploy and then go
 * stale the next session. The sitemap protocol allows leaving lastmod out.
 */
const LIVE_SITEMAP_PATHS = new Set(["/markets", "/market-news"]);

type SitemapEntry = {
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
  lastModified?: string;
};

const ENTRIES: SitemapEntry[] = [
  { path: "", changeFrequency: "weekly", priority: 1, lastModified: "2026-10-10" },
  { path: "/about", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/performance", changeFrequency: "yearly", priority: 0.4, lastModified: "2026-07-08" },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-10-10" },
  { path: "/demo", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-18" },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-10" },
  { path: "/markets", changeFrequency: "weekly", priority: 0.8 },
  { path: "/market-news", changeFrequency: "weekly", priority: 0.7 },
  { path: "/privacy-policy", changeFrequency: "monthly", priority: 0.4 },
  { path: "/terms-of-service", changeFrequency: "monthly", priority: 0.4 },
  { path: "/refunds", changeFrequency: "monthly", priority: 0.4 },
  { path: "/ai-disclaimer", changeFrequency: "monthly", priority: 0.4 },
  { path: "/legal/archive", changeFrequency: "monthly", priority: 0.3 },
  { path: "/trust", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-13" },
  { path: "/methodology", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-16" },
  { path: "/docs", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/start-here", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-29" },
  { path: "/help", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-10" },
  { path: "/tax", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-10" },
  { path: "/changelog", changeFrequency: "monthly", priority: 0.3, lastModified: "2026-10-13" },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/status", changeFrequency: "weekly", priority: 0.4, lastModified: "2026-10-11" },
  { path: "/stox", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/koins", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-10" },
  { path: "/smitty", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-10" },
  { path: "/buy-the-bots", changeFrequency: "monthly", priority: 0.4, lastModified: "2026-10-10" },
  { path: "/headmaster", changeFrequency: "monthly", priority: 0.6, lastModified: "2026-10-13" },
  { path: "/chat", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-13" },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.3 },
  { path: "/how-to-maximize-results", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-10-13" },
];

function legalKeyFor(path: string): LegalPageKey | undefined {
  return (Object.keys(LEGAL_PAGES) as LegalPageKey[]).find((key) => LEGAL_PAGES[key].href === path);
}

function entryLastModified(entry: SitemapEntry): string | undefined {
  if (LIVE_SITEMAP_PATHS.has(entry.path)) return undefined;
  const legalKey = legalKeyFor(entry.path);
  if (legalKey) return legalStampToIso(latestLegalVersion(legalKey).date);
  // /legal/archive prints this stamp via LegalShell's updated prop. It does not pass a page key.
  if (entry.path === "/legal/archive") return legalStampToIso(LEGAL_PAGES.terms.versions[0].date);
  return entry.lastModified;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ENTRIES.map((entry) => {
    const lastModified = entryLastModified(entry);
    return {
      url: `${siteUrl}${entry.path}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    };
  });
  const docsIndex = ENTRIES.find((entry) => entry.path === "/docs");
  const guides = DOCS_GUIDES.map((guide) => ({
    url: `${siteUrl}/docs/${guide.slug}`,
    lastModified: docsIndex?.lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));
  const tickers = publicTickerPaths().map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));
  // Goal b20 G-23: learn hub, guides and comparison pages.
  const learn = ["/learn", ...GUIDES.map((g) => `/learn/${g.slug}`), ...COMPARISONS.map((c) => `/compare/${c.slug}`)].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: "2026-10-18",
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));
  return [...pages, ...guides, ...learn, ...tickers];
}
