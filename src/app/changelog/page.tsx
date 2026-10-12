import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/changelog", {
  title: "Changelog — AetherForge AI",
  description: "Recent product changes on AetherForge AI, taken from the published commit history.",
});

export const CHANGELOG_ENTRIES = [
  {
    href: "/dashboard",
    title: "13 Oct 2026 — Retest 12",
    body: "The return split is one whole-book figure on the dashboard, stocks, and crypto, and it waits for the ledger. A hub P/L card is labelled as that asset class only. The 1-hour move on a coin page uses the same list field as the table. Each coin names the feed that supplied it, or says the source is unavailable. Crypto last-updated uses the snapshot time. Contact is its own page. Cookies lists the cookies the site sets. A missing CoinPaprika figure is an em dash with the reason, and fully diluted value is derived from price times supply when the feed sends supply. Chain names fill from the known list. DEX prices keep the last good snapshot and refresh in the background. Confirm shows the toast after the save, keeps the cards on screen, and updates cash and holdings from one response. An AetherForge export imports as AetherForge. Coin names use the published name, including Wrapped Ether and dYdX.",
  },
  {
    href: "/dashboard",
    title: "13 Oct 2026 — Retest 11",
    body: "The currency effect uses the buy price of each open lot, plus the exchange-rate result already realised on sells, plus foreign cash. Ledger tables hide live=, chain=, and pxat= stamps. The CSV export keeps chain= and pxat=. The crypto table shows maximum supply, the 1-hour move, and the 30-day move, and a row opens the coin page. A missing figure is an em dash with the reason the feed left it out. A short coin list says how many prices arrived. Top movers on the crypto desk rank the live coin list. Search Markets opens the coin search. The home ticker clock is the same on the server and in the browser. The ticker names the feed that supplied the prices. The return split is one figure on the dashboard, stocks, and crypto. DEX prices refresh when they are older than about five minutes, and the as-at time is the saved snapshot. Confirm reads cash and the holding once. Header totals stay on the last figure until the book reload finishes, then show that result. Coin names use the feed name, and DYDX is shown as dYdX.",
  },
  {
    href: "/markets",
    title: "12 Oct 2026 — Research retest",
    body: "The freephone number is no longer shown. The home ticker reads the shared crypto snapshot. Market cap, volume and the related figures come from the keyless price list when the saved row does not have them. A missing figure is an em dash. Coin pages use the snapshot for supply and for the 1-hour, 7-day and 30-day moves. A missing live price is written as live=n/a. Sharesies files are recognised when the headers vary. A generic CSV opens the column map. The currency effect uses the foreign value of each lot. The ledger can show every row. Koins shows snapshot prices. A Stox report names a print under review and keeps a rating reason. The plain-English note is written by AI. Crypto, DEX, the ticker and Koins read one saved list, including chain and the names Render and dYdX. A DEX list older than about 10 minutes refreshes inside the request. Cash in the header follows the ledger after a buy. A buy audit includes chain= and pxat=, and live= only from a server snapshot price. The ledger count matches the CSV.",
  },
  {
    href: "/import",
    title: "12 Oct 2026 — Batch 2 retest fixes",
    body: "Sharesies company names map only when one listing matches. A foreign trade with no rate in the file uses the reviewed rate for that trade date. A readable CSV opens the column map. Return uses a stored mark, with its source and as-of, when the holding has one. /dividends opens the dividend ledger. The tax overview labels net cash and gross, and it is not an accountant sign-off. A CSV export of your transactions is on Starter and above. Report holdings counts follow the book. The return split adds up to the P/L figure.",
  },
  {
    href: "/import",
    title: "11 Oct 2026 — Batch 2",
    body: "Develop 18375819. Broker import, money-weighted and time-weighted return, dividends, the tax pack, trust, price badges, alerts, the installable shell, bot guides, schema, and the help feed.",
    },
  {
    href: "/markets",
    title: "12 Oct 2026 — One crypto snapshot for markets, Koins, and Confirm",
    body: "Signed-in and public Crypto and DEX lists read the same saved snapshot. Names and chains come from that list. Koins ranks only when the snapshot is fresh and the moves are real. Confirm writes the reviewed price and returns. Revaluation follows. Crypto projections stay paused.",
  },
  {
    href: "/markets",
    title: "11 Oct 2026 — Crypto list snapshots and diagnostics",
    body: "A saved CoinGecko list and a saved DEX list stay available when the live feed does not answer. An optional CoinGecko key can be set on the host. The admin diagnostics page reports status codes only.",
  },
  {
    href: "/markets",
    title: "11 Oct 2026 — Retest4 market lists",
    body: "Develop 47f44d9. DEX lists, the crypto fill, coin titles, and the DexScreener display gate.",
  },
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
