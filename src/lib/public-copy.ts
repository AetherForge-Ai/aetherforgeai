/**
 * Shared public sentences for the P1 legal, privacy, and engine copy.
 * Exported strings are shown to visitors. They must not contain the word TODO,
 * a model name, or an invented owner-only fact.
 *
 * TODO(owner): confirm whether published prices include or exclude GST. Do not write "including GST" or "excluding GST" until then.
 * TODO(owner): confirm the AI provider name. Public copy says "an AI provider" until then.
 * TODO(owner): confirm the share-price vendor name before naming it in the processor list.
 * TODO(owner): confirm the Yahoo licence position for prices in a paid product.
 * TODO(owner): confirm the metals spot vendor name.
 * TODO(owner): confirm the FX vendor name.
 * TODO(owner): confirm the support@ mailbox before publishing an address.
 * TODO(owner): confirm the privacy@ mailbox before publishing an address.
 * TODO(owner): have a qualified NZ adviser check the re-issued Terms, Privacy Policy and AI Disclaimer.
 */

/** Re-issue date for Terms, Privacy, and the AI Disclaimer. Keep TERMS_VERSION in sync. */
export const LEGAL_UPDATED = "7 October 2026";

export const ENGINE_PARAGRAPH =
  "Scores and projected ranges are calculated by a rules-based technical-analysis engine. AI writes the plain-English note that explains those calculated figures.";

export const TRIAL_FAQ =
  "Yes. Starter and Pro each begin with a 14-day trial of that plan. A card is collected at checkout, nothing is charged until the trial ends, and you can cancel before then. Ultimate is founder-led — use Talk to us rather than self-serve checkout.";

export const TRIAL_CARD_LINE =
  "Starter and Pro include a 14-day trial and a card is collected at checkout. Cancel anytime.";

export const REFUND_FAQ =
  "Paid plans start with a 14-day trial of the plan you choose, so you can explore it before you're charged. If you're ever billed in error or something isn't right, reach out and we'll make it right — we don't believe in trapping customers.";

export const DATA_SHARING_LINE =
  "Your data is never sold. It's shared only with the processors listed in our Privacy Policy.";

export const SECURITY_LINE =
  "Encrypted in transit (HTTPS). Payments handled by Stripe. We never see your card number.";

export const ANALYTICS_NOTICE = "We use Google Analytics to see which pages are used.";

export const ANNUAL_TOOLKIT_LINE =
  "professional Excel investor toolkit (Portfolio Tracker and Transactions spreadsheets)";

export const PROCESSORS: { name: string; role: string }[] = [
  { name: "Cloudflare", role: "public site and network" },
  { name: "Stripe", role: "subscription payments. We never see your card number" },
  // TODO(owner): name the AI provider when it is confirmed. Public copy stays "An AI provider".
  { name: "An AI provider", role: "plain-English notes on calculated figures" },
  { name: "Google Analytics", role: "which pages are used" },
  { name: "Totalum on Google Cloud", role: "account storage" },
  { name: "CoinGecko", role: "crypto prices" },
  // TODO(owner): name the share-price, metals and FX vendors when they are confirmed.
  {
    name: "Licensed market-data vendors",
    role: "share prices, metals and foreign exchange",
  },
];

export const FRESHNESS_PLAIN = [
  "NZX and ASX figures are delayed during the regular session, or the last close after that session ends.",
  "US share figures are the last close in New York once that session has ended.",
  "Crypto quotes are current when the quote itself is current. If it is older, the page should show the time it was updated.",
  "Foreign-exchange rates are a daily rate.",
  "Profit and loss uses the latest available price.",
].join(" ");
