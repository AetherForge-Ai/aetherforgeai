/**
 * Shared public sentences for the P1 legal, privacy, and engine copy.
 * Exported strings are shown to visitors. They must not contain the word TODO,
 * a model name, or an invented owner-only fact.
 *
 * Public copy says "a third-party AI service" and "AI". It does not name a model or a provider.
 * TODO(owner): have a qualified NZ adviser check the re-issued Terms, Privacy Policy and AI Disclaimer.
 */

import { LEGAL_ENTITY_NAME } from "@/lib/company";
import { dexscreenerPublicDisplay } from "@/lib/dexscreener-display";
import { swyftxPublicDisplay } from "@/lib/swyftx-display";
import { PROJECTIONS_DESCRIPTION } from "@/lib/projections-mode";
import { SHORT_DISCLAIMER } from "@/lib/disclaimer";

/** pull-check:track-b-p0-2026-10-11 */
/** pull-check:v3-retest9-2026-10-12 */
/** pull-check:v3-retest10-2026-10-13 */

/** The freephone is not published. It is out of credit. */

/** General and customer mail. Privacy requests use PRIVACY_OFFICER_EMAIL. */
export const CUSTOMER_EMAIL = "admin@aetherforgeai.co.nz";

/** Privacy Officer, privacy requests, and the Lukas contact. */
export const PRIVACY_OFFICER_EMAIL = "lukas@aetherforgeai.co.nz";

/** The one address shown on /contact, next to the form (Lukas, 15 Oct 2026). No postal address is published. */
export const CONTACT_PAGE_EMAIL = PRIVACY_OFFICER_EMAIL;

/** Both public contact addresses. Footer, About, Terms, Privacy and Trust show both. */
export const PUBLIC_CONTACT_EMAILS = [CUSTOMER_EMAIL, PRIVACY_OFFICER_EMAIL] as const;

/**
 * One paper-book sentence for Trust, How it works, Privacy, Terms and the home page.
 * Do not shorten it into "you execute elsewhere".
 */
/** BL-5 default: one positioning line for every bot and Headmaster page. */
export const POSITIONING_LINE = "AetherForge is a portfolio tracker with a paper-trading book.";

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

/**
 * Shown on Terms, Privacy, the AI Disclaimer, and Refunds.
 * The signup consent stamp stays on TERMS_VERSION until that consent flow is re-issued.
 */
export const LEGAL_UPDATED = "16 Oct 2026";

/**
 * D1: share projections are a member page. The figures stay off the public
 * document. Crypto projections stay paused.
 */
export const PROJECTIONS_MEMBER_LINE = PROJECTIONS_DESCRIPTION;

/**
 * BL-6 default (approved 16 Oct 2026): the Ultimate card reads
 * "From NZ$199/mo — Talk to us". Set true to show the fixed monthly/annual price again.
 * Seats, client portfolios and the API stay behind ULTIMATE_FEATURES (off).
 */
export const ULTIMATE_PRICE_PENDING_D6 = false;

/** One line for the site footer and the AI Disclaimer. */
export const ONE_LINE_DISCLAIMER = SHORT_DISCLAIMER;

/** Annual refund rule approved 13 Oct 2026. Monthly plans use MONTHLY_CANCEL_RULE. */
export const ANNUAL_REFUND_RULE =
  "Annual plans: you can cancel within 14 days of your annual charge or renewal for a full refund. After 14 days there is no refund, but you keep access until the end of your paid year and the plan will not renew. We email you a reminder 7 days before each annual renewal. Billing errors are always refunded, and nothing here limits your rights under the Consumer Guarantees Act 1993.";

export const MONTHLY_CANCEL_RULE =
  "Monthly plans: you can cancel at any time and keep access until the end of the paid month.";

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
  "A CSV export of your transactions is included on Starter and above. Yearly billing also includes a downloadable Excel investor toolkit template. That file is a blank template. It is not filled with your holdings, and it is not a copy of the figures in the ledger.";

/**
 * What a completion request can include. Each sentence is true of the server
 * routes that post it. Retention at the service is not stated here.
 */
export const AI_REQUEST_LINES = [
  "Scores and projected ranges are calculated by a rules-based engine. A third-party AI service writes the plain-English note on a ticker, the replies in the assistant, the Portfolio Notes Assistant, the Headmaster chat and the site guide, the portfolio analysis report, and the summary in a free-trial briefing. We do not use any other AI provider. Those notes are labelled “AI-written note”. A stored member report for Stox, Koins or Headmaster marks its summary as not AI-enhanced, because that summary is built from the calculated figures.",
  "The assistant can send the question you typed, and recent messages in that chat. When the paper book has holdings, it can also send the holding count, the total market value, the total cost, the total unrealised profit or loss, the best and worst performer, the sector weights, and for each holding the ticker, the name, the sector, the share count, the average price, the current price, the value, the profit or loss, and the weight.",
  "The Portfolio Notes Assistant can send your question, and recent messages in that chat. When a Headmaster book is available it can also send the cash balance, the total value, the profit or loss, the diversification score and its label, and the allocation weights and values in NZ$, including cash. It can send the top eight positions with name, asset class, weight and value, the latest Stox and Koins findings, and the Headmaster ideas for names in the book. It can send a plan you typed and report text you attached.",
  "The Headmaster chat can send your question, and recent messages in that chat. It can send the total value, the total cost, the profit or loss, the cash balance, the cash weight, the retained-cash target, the illustrated cash reallocation, and the working that produces that reallocation. It can send each asset class with its weight, its value in NZ$ and its position count, the top eight positions with name, asset class, weight, value and profit or loss, concentration-risk notes, stress-test impacts in NZ$ and percent, and the bull, base and bear scenario pathways. When the book is invested it can send the diversification score and HHI. It can send a calculated yearly return and volatility for the mix. It can send the latest Stox and Koins findings, and the Headmaster ideas block. Names outside the book are included only when you ask for a watchlist.",
  "A ticker note can send the ticker, the question you typed, and the quote used for that note. If you leave the question blank, the request still includes a short default question.",
  "The portfolio analysis report can send the same paper-book summary as the assistant: the holding count, the total market value, the total cost, the total unrealised profit or loss, the best and worst performer, the sector weights, and for each holding the ticker, the name, the sector, the share count, the average price, the current price, the value, the profit or loss, and the weight.",
  "A free-trial briefing can send the tickers you picked, their market figures (price, recent changes, momentum and indicators), and the market's top movers. It does not send your name or your holdings.",
  "The site guide, which needs no login, can send the message you type and recent messages in that chat.",
  "A weekly projections email, when that email is enabled, can send the market-wide indicative 7-day projections already on the projections page: the ticker, the name, the market, the indicative percent, and the as-of label. It does not send a person's holdings, values, cash, profit or loss, or allocation. It does not send the email address. It does not use a report allowance. One note is written for the week and reused for each recipient.",
  "We never send your email address, your name or your account ID to the AI service, and the request does not include a card number. Anything you type into a chat is sent as you wrote it, so please do not type personal details you do not want shared. Our code does not write the text of these requests to its logs. Messages in the assistant chat and the Portfolio Notes Assistant are saved to your account so the conversation can continue, and they stay until you clear the chat. The Headmaster chat, the ticker note, the portfolio analysis report and the site guide do not save your messages. Stored Stox and Koins reports stay in your account. To have reports or your account deleted, email us and we delete them. The AI provider keeps a request under its own API terms.",
] as const;

/**
 * Phrases that must appear in AI_REQUEST_LINES. Each one is a category the
 * named route puts in the completion request. Checked by the Track B test.
 */
export const AI_SENT_CATEGORIES = {
  "/api/chat": [
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
    "your question",
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
    "your question",
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
  "/api/analysis": [
    "the holding count",
    "the total market value",
    "the sector weights",
    "the share count",
    "the average price",
  ],
  "/api/free-trial/run": [
    "the tickers you picked",
    "their market figures",
    "the market's top movers",
  ],
  "/api/personal-guide": [
    "the message you type",
    "recent messages in that chat",
  ],
  "/api/ticker-analysis": [
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
  const rows: { name: string; role: string }[] = [
    { name: "CoinGecko", role: "crypto prices" },
    { name: "CoinPaprika", role: "crypto prices" },
    { name: "CoinCap", role: "crypto prices" },
    { name: "Binance", role: "public crypto price tickers" },
  ];
  if (swyftxPublicDisplay()) {
    rows.push({ name: "Swyftx", role: "crypto prices when that feed is shown" });
  }
  rows.push(
    { name: "Kraken", role: "crypto prices" },
    { name: "Coinbase", role: "crypto prices" },
    { name: "Yahoo Finance", role: "prices for NZX-listed, ASX-listed and US shares, and mapped crypto quotes" },
    { name: "GeckoTerminal", role: "DEX token prices" },
    { name: "DexPaprika", role: "DEX token prices" }
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
