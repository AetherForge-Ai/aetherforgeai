import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/changelog", {
  title: "Changelog — AetherForge AI",
  description: "Recent product changes on AetherForge AI, taken from the published commit history.",
});

export const CHANGELOG_ENTRIES = [
  {
    href: "/tax",
    title: "11 Oct 2026 — Tax fixups and the Tax link",
    body: "Develop 9dedb71. Auckland dates, realised lots, dividends, the CSV gate, metals loading, the home disclaimer, and a Tax link in the footer and navigation.",
  },
  {
    href: "/market-news",
    title: "11 Oct 2026 — News filter and projection index",
    body: "A Jersey residency column stays off the news feed. Equity projections stay on their page and are left out of the sitemap while crypto projections are paused.",
  },
  {
    href: "/markets",
    title: "11 Oct 2026 — Ledger dates, corrections, CSV and plan copy",
    body: "Develop 87dfce1. Ledger dates, holding corrections, the CSV export, and plan copy.",
  },
  {
    href: "/markets",
    title: "11 Oct 2026 — Crypto counts, report consistency and plan limits",
    body: "Develop caa5472. Crypto list counts, report consistency, and plan limits.",
  },
  {
    href: "/tax",
    title: "10 Oct 2026 — Dates, money, CSV, headers, tax summary and onboarding",
    body: "Develop eb6a0d9. Display dates, money format, CSV columns, security headers, the tax summary, and onboarding.",
  },
  {
    href: "/markets",
    title: "10 Oct 2026 — Corrections, DEX source, titles and copy",
    body: "Develop 5f27fe0. Correction rows, the DEX source, page titles, and public copy.",
  },
  {
    href: "/dashboard",
    title: "10 Oct 2026 — Report logic, quote review, sleeves and loading",
    body: "Develop 494c41d. Report logic, quote review, Headmaster sleeves, and loading states.",
  },
  {
    href: "/pricing",
    title: "10 Oct 2026 — Plan, billing, notifications, 404s, tape and sitemap",
    body: "Develop c72caf8. Plan and billing, notification choices, the 404 gate, tape labels, the sitemap, and navigation.",
  },
  {
    href: "/markets",
    title: "10 Oct 2026 — Crypto markets and paper-book wording",
    body: "Develop e0ecbc9. The crypto markets list and one paper-book sentence.",
  },
  {
    href: "/privacy-policy",
    title: "10 Oct 2026 — Sub-cent prices, correction dates and analytics consent",
    body: "Develop 2b7e8e8. Sub-cent prices, Auckland correction dates, and analytics consent.",
  },
  {
    href: "/pricing",
    title: "10 Oct 2026 — Public copy and markets polish",
    body: "Develop fa2643e. Public copy and markets polish.",
  },
  {
    href: "/market-news",
    title: "10 Oct 2026 — News wording and off-topic cards",
    body: "Develop e9afcf5. News entities are decoded, off-topic cards are dropped, and signal labels stay off the public pages.",
  },
  {
    href: "/market-news",
    title: "8 Oct 2026 — News, legal copy, ticker and dashboard",
    body: "Verbatim news wording, legal copy, the public ticker, and the dashboard follow-ups from that release.",
  },
  {
    href: "/trust",
    title: "8 Oct 2026 — Freshness labels and Free gating",
    body: "Freshness labels, Free-plan gating, and one projected figure on the research pages.",
  },
  {
    href: "/trust",
    title: "8 Oct 2026 — Trust, footer and market news",
    body: "Trust page, legal copy, the shared footer, the NZSX board, and market news.",
  },
  {
    href: "/markets",
    title: "7 Oct 2026 — Crypto tape and reviewed FX",
    body: "One crypto tape, a vendor-ID map, a sanity gate, and a bound on the reviewed foreign-exchange rate.",
  },
  {
    href: "/projections",
    title: "7 Oct 2026 — Crypto projections paused",
    body: "Crypto projections were paused. Trade signals were removed from public copy.",
  },
  {
    href: "/docs",
    title: "7 Oct 2026 — One transaction panel",
    body: "Reviewed price, foreign exchange and cash changes, and one panel for recording a movement.",
  },
  {
    href: "/markets",
    title: "6 Oct 2026 — Shareable market pages",
    body: "Crypto and stock tickers open as their own Markets pages.",
  },
] as const;

export default function ChangelogPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Changelog"
      title="Changelog"
      lede="These notes follow recent published changes. They are not a performance record and they are not a forecast. The same notes are available as RSS at /rss.xml."
      links={[...CHANGELOG_ENTRIES]}
    />
  );
}
