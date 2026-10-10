/**
 * Shared public sentences for the P1 legal, privacy, and engine copy.
 * Exported strings are shown to visitors. They must not contain the word TODO,
 * a model name, or an invented owner-only fact.
 *
 * Public copy says "a third-party AI service" and "AI". It does not name a model or a provider.
 * TODO(owner): have a qualified NZ adviser check the re-issued Terms, Privacy Policy and AI Disclaimer.
 */

import { dexscreenerPublicDisplay } from "@/lib/dexscreener-display";
import { swyftxPublicDisplay } from "@/lib/swyftx-display";

/** pull-check:track-b-p0-2026-10-11 */

/** General and customer mail. Privacy requests use PRIVACY_OFFICER_EMAIL. */
export const CUSTOMER_EMAIL = "admin@aetherforgeai.co.nz";

/** Privacy Officer, privacy requests, and the Lukas contact. */
export const PRIVACY_OFFICER_EMAIL = "lukas@aetherforgeai.co.nz";

/** Both public contact addresses. Footer, About, Terms, Privacy and Trust show both. */
export const PUBLIC_CONTACT_EMAILS = [CUSTOMER_EMAIL, PRIVACY_OFFICER_EMAIL] as const;

/** The number already printed on the footer. */
export const PUBLIC_PHONE_DISPLAY = "0800 238 437";
export const PUBLIC_PHONE_TEL = "0800238437";

/**
 * One paper-book sentence for Trust, How it works, Privacy, Terms and the home page.
 * Do not shorten it into "you execute elsewhere".
 */
export const PAPER_BOOK_STATEMENT =
  "AetherForge is a paper book: you record what you hold or would trade (cash, buys, sells, corrections, dividends) in NZ$. Real trades happen at your broker. We never move money.";

/** Same sentence on the home page and How it works. Smitty is not a fourth AI bot. */
export const BOT_COUNT_LINE =
  "Three AI bots — Stox, Koins and The Headmaster. Smitty tracks gold and silver spot and holdings only.";

/** Spot and holdings only. Smitty does not run a report. */
export const SMITTY_ROLE_LINE =
  "Smitty tracks gold and silver spot prices and holdings only. Smitty does not run a report.";

/** Free plan allowance. Pricing, How it works and the plan cards use this sentence. */
export const FREE_REPORTS_LINE = "3 reports a month free, no card.";

/** Matches the plan matrix: Email support is on for Free, Starter, Pro and Ultimate. */
export const EMAIL_SUPPORT_LINE = "Every plan — including Free — includes email support.";

/** Honest history lengths. Projections use 30 days. Stock charts use about six months. */
export const HISTORY_LENGTH_LINE = "30-day history (projections), ~6 months (stock charts).";

/** Re-issue date for Terms, Privacy, and the AI Disclaimer. Keep TERMS_VERSION in sync. */
export const LEGAL_UPDATED = "7 Oct 2026";

export const ENGINE_PARAGRAPH =
  "Scores and projected ranges are calculated by a rules-based technical-analysis engine. AI writes the plain-English note that explains those calculated figures.";

export const TRIAL_FAQ =
  "Yes. Starter and Pro each begin with a 14-day trial of that plan. A card is collected at checkout, nothing is charged until the trial ends, and you can cancel before then. Ultimate is founder-led — use Talk to us rather than self-serve checkout.";

export const TRIAL_CARD_LINE =
  "Starter and Pro include a 14-day trial and a card is collected at checkout. Cancel anytime.";

export const REFUND_FAQ =
  "If you're ever billed in error or something isn't right, reach out and we'll make it right — we don't believe in trapping customers.";

export const DATA_SHARING_LINE =
  "Your data is never sold. It's shared only with the processors listed in our Privacy Policy.";

export const SECURITY_LINE =
  "Encrypted in transit (HTTPS). Payments handled by Stripe. We never see your card number.";

export const ANALYTICS_NOTICE =
  "Analytics stays off until you accept. Decline keeps it off. You can change this later from Cookie settings.";

export const LEDGER_EXPORT_LINE =
  "Published plans include the paper ledger and a CSV export of your transactions. Yearly billing also includes a downloadable Excel investor toolkit template. That file is a blank template. It is not filled with your holdings, and it is not a copy of the figures in the ledger.";

/**
 * What a completion request can include. Each sentence is true of the server
 * routes that post it. Retention at the service is not stated here.
 */
export const AI_REQUEST_LINES = [
  "Scores and projected ranges are calculated by a rules-based engine. A third-party AI service writes the plain-English note on a ticker and the replies in the assistant, the Portfolio Execution Coach, and the Headmaster chat. Those notes are labelled “AI-written note”. A stored member report for Stox, Koins or Headmaster marks its summary as not AI-enhanced, because that summary is built from the calculated figures.",
  "The assistant can send your name, the question you typed, and recent messages in that chat. When the paper book has holdings, it can also send the holding count, the total market value, the total cost, the total unrealised profit or loss, the best and worst performer, the sector weights, and for each holding the ticker, the name, the sector, the share count, the average price, the current price, the value, the profit or loss, and the weight.",
  "The Portfolio Execution Coach can send your name, your question, and recent messages in that chat. When a Headmaster book is available it can also send the cash balance, the total value, the profit or loss, the diversification score and its label, and the allocation weights and values in NZ$, including cash. It can send the top eight positions with name, asset class, weight and value, the latest Stox and Koins findings, and the Headmaster ideas for names in the book. It can send a plan you typed and report text you attached.",
  "The Headmaster chat can send your name, your question, and recent messages in that chat. It can send the total value, the total cost, the profit or loss, the cash balance, the cash weight, the retained-cash target, the illustrated cash reallocation, and the working that produces that reallocation. It can send each asset class with its weight, its value in NZ$ and its position count, the top eight positions with name, asset class, weight, value and profit or loss, concentration-risk notes, stress-test impacts in NZ$ and percent, and the bull, base and bear scenario pathways. When the book is invested it can send the diversification score and HHI. It can send a calculated yearly return and volatility for the mix. It can send the latest Stox and Koins findings, and the Headmaster ideas block. Names outside the book are included only when you ask for a watchlist.",
  "A ticker note can send your name, the ticker, the question you typed, and the quote used for that note. If you leave the question blank, the request still includes a short default question.",
  "A weekly projections email, when that email is enabled, can send the market-wide indicative 7-day projections already on the projections page: the ticker, the name, the market, the indicative percent, and the as-of label. It does not send a person's holdings, values, cash, profit or loss, or allocation. It does not send the email address. It does not use a report allowance. One note is written for the week and reused for each recipient.",
  "The request does not include a card number. The code that sends the request does not set a retention period.",
] as const;

/**
 * Phrases that must appear in AI_REQUEST_LINES. Each one is a category the
 * named route puts in the completion request. Checked by the Track B test.
 */
export const AI_SENT_CATEGORIES = {
  "/api/chat": [
    "your name",
    "the question you typed",
    "recent messages",
    "the holding count",
    "the total market value",
    "the total cost",
    "the total unrealised profit or loss",
    "the best and worst performer",
    "the sector weights",
    "the ticker",
    "the name",
    "the sector",
    "the share count",
    "the average price",
    "the current price",
    "the value",
    "the profit or loss",
    "the weight",
  ],
  "/api/portfolio-coach": [
    "your name",
    "the question you typed",
    "recent messages",
    "the cash balance",
    "the total value",
    "the profit or loss",
    "the diversification score and its label",
    "the allocation weights and values in NZ$",
    "the top eight positions with name, asset class, weight and value",
    "the latest Stox and Koins findings",
    "the Headmaster ideas for names in the book",
    "a plan you typed",
    "report text you attached",
  ],
  "/api/totalum/chat": [
    "your name",
    "the question you typed",
    "recent messages",
    "the total value",
    "the total cost",
    "the profit or loss",
    "the cash balance",
    "the cash weight",
    "the retained-cash target",
    "the illustrated cash reallocation",
    "the working that produces that reallocation",
    "its value in NZ$ and its position count",
    "the top eight positions with name, asset class, weight, value and profit or loss",
    "concentration-risk notes",
    "stress-test impacts in NZ$ and percent",
    "the bull, base and bear scenario pathways",
    "the diversification score and HHI",
    "a calculated yearly return and volatility",
    "the latest Stox and Koins findings",
    "the Headmaster ideas block",
    "Names outside the book are included only when you ask for a watchlist",
  ],
  "/api/ticker-analysis": [
    "your name",
    "the ticker",
    "the question you typed",
    "the quote used for that note",
    "a short default question",
  ],
  "/api/cron/weekly-email": [
    "market-wide indicative 7-day projections",
    "the ticker",
    "the name",
    "the market",
    "the indicative percent",
    "the as-of label",
    "It does not send a person's holdings",
    "values",
    "cash",
    "profit or loss",
    "allocation",
    "It does not send the email address",
    "It does not use a report allowance",
    "One note is written for the week",
  ],
} as const satisfies Record<string, readonly string[]>;

function marketProcessors(): { name: string; role: string }[] {
  const rows: { name: string; role: string }[] = [{ name: "CoinGecko", role: "crypto prices" }];
  if (swyftxPublicDisplay()) {
    rows.push({ name: "Swyftx", role: "crypto prices when that feed is shown" });
  }
  rows.push(
    { name: "Kraken", role: "crypto prices" },
    { name: "Coinbase", role: "crypto prices" },
    { name: "Yahoo Finance", role: "prices for NZX-listed, ASX-listed and US shares, and mapped crypto quotes" },
    { name: "GeckoTerminal", role: "DEX token prices" }
  );
  if (dexscreenerPublicDisplay()) {
    rows.push({ name: "DexScreener", role: "DEX token prices when that feed is shown" });
  }
  return rows;
}

/** Request-time processor list. Swyftx and DexScreener are included only when their display flags are on. */
export function PROCESSORS(): { name: string; role: string }[] {
  return [
    { name: "Cloudflare", role: "public site and network" },
    { name: "Stripe", role: "subscription payments. We never see your card number" },
    // Public copy does not name a model or a provider. Retention at that service is not set by this request.
    { name: "A third-party AI service", role: "plain-English notes and assistant replies" },
    { name: "Google Analytics", role: "which pages are used" },
    { name: "Totalum on Google Cloud", role: "account storage" },
    ...marketProcessors(),
    { name: "gold-api.com", role: "gold and silver spot prices" },
    { name: "ExchangeRate-API", role: "daily foreign-exchange rates" },
    { name: "Frankfurter", role: "foreign-exchange rates on past trade dates" },
  ];
}

export const FRESHNESS_PLAIN = [
  "NZX and ASX figures are delayed during the regular session, or the last close after that session ends.",
  "US share figures are the last close in New York once that session has ended.",
  "Crypto quotes are delayed or indicative. The page shows the as-of time when it has one.",
  "Foreign-exchange rates are a daily rate.",
  "Profit and loss uses the latest available price.",
].join(" ");
