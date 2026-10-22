/**
 * Published changelog notes, newest first, in plain English for members and visitors.
 * Kept off the page module so Next.js page exports stay valid. No commit references or internal terms.
 */
export const CHANGELOG_ENTRIES = [
  {
    href: "/tax",
    title: "22 Oct 2026 — Tax-year dates and quicker links",
    body: "A transaction dated 1 April now always counts in the new tax year in tax reports, the tax pack and performance figures, whether New Zealand is on daylight time or standard time. Old links to the ledger now go straight to the Transactions tab, and the markets page starts sending sooner.",
  },
  {
    href: "/portfolio",
    title: "22 Oct 2026 — Cash after overseas buys and share splits in holdings",
    body: "The cash balance on the transactions page now matches the portfolio summary after a buy in a foreign currency, because both add up the same ledger in NZ dollars. A recorded share split now shows in your holdings with the new share count and the average price divided by the split ratio, with the NZ$ cost unchanged.",
  },
  {
    href: "/portfolio",
    title: "22 Oct 2026 — Share splits, exchange rates and crypto notes",
    body: "Recording a share split no longer changes your cash balance. Exchange rates now pick up the provider's new daily rate soon after it is published, instead of up to two hours later. The crypto price note shows the New Zealand time zone in full (NZDT in summer, NZST in winter) and names both CoinGecko and CoinPaprika when both supplied prices.",
  },
  {
    href: "/status",
    title: "22 Oct 2026 — Help, guides and the status page",
    body: "The status page shows the last good time for each price feed in New Zealand time, and keeps it after an update to the site. When no new share quote has arrived, it shows the time of the latest saved quote instead of saying none exists. The help page and guides were refreshed.",
  },
  {
    href: "/markets",
    title: "22 Oct 2026 — A faster markets page",
    body: "The markets page and the coin pages open faster, because they start from the latest saved prices instead of waiting for every price source. The site also moved to a newer version of the framework it runs on. The crypto list no longer shrinks when a price refresh comes back short: coins that missed an update stay listed and are marked as delayed.",
  },
  {
    href: "/import",
    title: "21 Oct 2026 — InvestNow import marked as Beta",
    body: "The InvestNow import is labelled Beta until it has been checked against a real InvestNow export. The daily broker sync was made more reliable, with a backup check if a scheduled run is missed.",
  },
  {
    href: "/import",
    title: "20 Oct 2026 — InvestNow import and the IR3 tax page",
    body: "You can import an InvestNow file, with the same preview, duplicate check and undo as the other brokers. The IR3 tax page brings your tax figures together, and you can download them as a CSV or PDF.",
  },
  {
    href: "/tax",
    title: "20 Oct 2026 — Tax to the cent, broker files and status",
    body: "Tax figures now use one rounding rule everywhere, so they match to the cent. Tax pages link to the right Inland Revenue pages. More broker file layouts are recognised on import. The status page keeps showing the last good time when a feed is slow.",
  },
  {
    href: "/contact",
    title: "15 Oct 2026 — Contact form, clearer pricing and tidier market pages",
    body: "The Contact page now has a message form. The pricing page explains the refund rules the same way as the Refunds policy, and says that Pro and Ultimate reports can be refreshed once per bot every four hours. Profit and loss on the dashboard and the tax pages now include buying and selling fees in the same way. Stock pages show one company name and hide figures the data provider did not send. Dividends show a confirmation when they are saved and warn you about a possible double entry.",
  },
  {
    href: "/dashboard",
    title: "14 Oct 2026 — Dashboard improvements",
    body: "The Headmaster report has full sections for holdings, allocation, cash, recent trades and risks. The holdings table fits the screen, the performance chart opens straight away, and the Transactions tab loads faster. Share projections are now for signed-in members only.",
  },
  {
    href: "/dashboard",
    title: "13 Oct 2026 — Portfolio cards, coin pages and the ledger",
    body: "The share and crypto profit cards now show only that asset class. Coin pages use one price source for the price, the one-hour change and the chart, and they name that source. The transaction list shows the date and time of each trade more clearly.",
  },
  {
    href: "/markets",
    title: "12 Oct 2026 — Shared prices, coin pages and cash",
    body: "The markets page, Koins and the trade form now read the same crypto price list, so the same coin shows the same price everywhere. Cash in the header updates straight after a trade.",
  },
  {
    href: "/import",
    title: "12 Oct 2026 — Import matching, dividends and tax labels",
    body: "Importing a broker file matches company names more reliably. Dividends record the gross amount, imputation credits and withholding tax separately. Tax pages label their figures more clearly.",
  },
  {
    href: "/markets",
    title: "11 Oct 2026 — Crypto list snapshots and diagnostics",
    body: "A saved crypto list and a saved DEX list stay available when a price source is slow, so the markets page does not go blank. Tax pages were tidied and the Tax link was added to the menu.",
  },
  {
    href: "/ledger",
    title: "11 Oct 2026 — Ledger dates, corrections, CSV and plan limits",
    body: "You can correct a recorded trade, and the CSV export matches the ledger. Plan limits for holdings and reports are shown in the same way on every page.",
  },
  {
    href: "/dashboard",
    title: "10 Oct 2026 — Dates, money, headers and onboarding",
    body: "Dates and money are formatted the same way across the site. New members see a short checklist to get their book set up. Trade-signal labels stay off the public pages.",
  },
  {
    href: "/markets",
    title: "10 Oct 2026 — Crypto markets and paper-book wording",
    body: "The crypto list shows very small prices correctly. Pages explain more clearly that the paper book is a record you keep, not a broker account.",
  },
  {
    href: "/market-news",
    title: "8 Oct 2026 — News, legal pages and the footer",
    body: "Market news cards show their publish date and source. The legal pages and a shared footer were updated, and prices show how fresh they are.",
  },
  {
    href: "/projections",
    title: "7 Oct 2026 — Crypto projections paused and one trade panel",
    body: "Crypto projections are paused while we review them. Buying, selling and recording dividends now happen in one trade panel.",
  },
  {
    href: "/markets",
    title: "6 Oct 2026 — Shareable market pages",
    body: "Every stock and coin now has its own page that you can share.",
  },
] as const;

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** Day the entry's title starts with, as a sortable number. */
export function changelogEntryDay(title: string): number {
  const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/.exec(title);
  if (!m) return 0;
  return Date.UTC(Number(m[3]), MONTHS[m[2]] ?? 0, Number(m[1]));
}
