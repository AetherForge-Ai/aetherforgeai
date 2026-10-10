import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/changelog", {
  title: "Changelog — AetherForge AI",
  description: "Recent product changes on AetherForge AI, taken from the published commit history.",
});

const ENTRIES = [
  {
    href: "/market-news",
    title: "8 October 2026 — News, legal copy, ticker and dashboard",
    body: "Verbatim news wording, legal copy, the public ticker, and the dashboard follow-ups from that release.",
  },
  {
    href: "/trust",
    title: "8 October 2026 — Freshness labels and Free gating",
    body: "Freshness labels, Free-plan gating, and one projected figure on the research pages.",
  },
  {
    href: "/trust",
    title: "8 October 2026 — Trust, footer and market news",
    body: "Trust page, legal copy, the shared footer, the NZSX board, and market news.",
  },
  {
    href: "/markets",
    title: "7 October 2026 — Crypto tape and reviewed FX",
    body: "One crypto tape, a vendor-ID map, a sanity gate, and a bound on the reviewed foreign-exchange rate.",
  },
  {
    href: "/projections",
    title: "7 October 2026 — Crypto projections paused",
    body: "Crypto projections were paused. Trade signals were removed from public copy.",
  },
  {
    href: "/docs",
    title: "7 October 2026 — One transaction panel",
    body: "Reviewed price, foreign exchange and cash changes, and one panel for recording a movement.",
  },
  {
    href: "/markets",
    title: "6 October 2026 — Shareable market pages",
    body: "Crypto and stock tickers open as their own Markets pages.",
  },
] as const;

export default function ChangelogPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Changelog"
      title="Changelog"
      lede="These notes follow recent published changes. They are not a performance record and they are not a forecast."
      links={[...ENTRIES]}
    />
  );
}
