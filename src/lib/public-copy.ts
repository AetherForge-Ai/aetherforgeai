/**
 * Shared public sentences for the P1 legal, privacy, and engine copy.
 * Exported strings are shown to visitors. They must not contain the word TODO,
 * a model name, or an invented owner-only fact.
 *
 * Public copy says "a third-party AI service" and "AI". It does not name a model or a provider.
 * TODO(owner): have a qualified NZ adviser check the re-issued Terms, Privacy Policy and AI Disclaimer.
 */

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

export const PROCESSORS: { name: string; role: string }[] = [
  { name: "Cloudflare", role: "public site and network" },
  { name: "Stripe", role: "subscription payments. We never see your card number" },
  // Public copy does not name a model or a provider. Retention at that service is not set by this request.
  { name: "A third-party AI service", role: "plain-English notes and assistant replies" },
  { name: "Google Analytics", role: "which pages are used" },
  { name: "Totalum on Google Cloud", role: "account storage" },
  { name: "Yahoo Finance", role: "prices for NZX-listed, ASX-listed and US shares" },
  { name: "CoinGecko", role: "crypto prices" },
  { name: "Swyftx", role: "crypto prices when that feed answers" },
  { name: "GeckoTerminal", role: "DEX token prices" },
  { name: "gold-api.com", role: "gold and silver spot prices" },
  { name: "ExchangeRate-API", role: "daily foreign-exchange rates" },
  { name: "Frankfurter", role: "foreign-exchange rates on past trade dates" },
];

export const FRESHNESS_PLAIN = [
  "NZX and ASX figures are delayed during the regular session, or the last close after that session ends.",
  "US share figures are the last close in New York once that session has ended.",
  "Crypto quotes are current when the quote itself is current. If it is older, the page should show the time it was updated.",
  "Foreign-exchange rates are a daily rate.",
  "Profit and loss uses the latest available price.",
].join(" ");
