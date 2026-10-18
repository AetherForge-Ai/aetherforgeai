/**
 * CR-2: facts the assistants may state, generated from the single sources of truth
 * (plans.ts for prices). Pure module so tests and both chat prompts share it.
 */
import { PRICING_TIERS, PRICE_CURRENCY } from "@/lib/plans";

export const FIF_THRESHOLD_NZD = 50_000;
export const FIF_JOINT_THRESHOLD_NZD_FACT = 100_000;

/** Every NZ$ amount a plan can legitimately be quoted at. */
export function allowedPlanPricesNzd(): number[] {
  const out = new Set<number>();
  for (const t of PRICING_TIERS) {
    if (t.monthlyPrice != null) out.add(t.monthlyPrice);
    if (t.yearlyPrice != null) out.add(t.yearlyPrice);
  }
  return [...out].sort((a, b) => a - b);
}

function nz(n: number): string {
  return `NZ$${n.toLocaleString("en-NZ")}`;
}

export function planPriceLines(): string[] {
  return PRICING_TIERS.map((t) => {
    if (t.id === "free") return `- ${t.name}: ${nz(0)}, no card required.`;
    if (t.cta.kind === "sales")
      return `- ${t.name}: From ${nz(t.monthlyPrice ?? 0)}/mo — Talk to us (founder-led, no self-serve checkout).`;
    return `- ${t.name}: ${nz(t.monthlyPrice ?? 0)}/mo or ${nz(t.yearlyPrice ?? 0)}/yr.`;
  });
}

/** Markdown block injected into the Help Assistant and Portfolio Notes Assistant prompts. */
export function guideFactsBlock(): string {
  return [
    "## Verified facts (state exactly; never change the numbers)",
    "### Plans and prices",
    ...planPriceLines(),
    `- All prices in ${PRICE_CURRENCY}. Do not mention any tax on top of prices. Never quote a price that is not listed here; point to /pricing.`,
    "### Paper book",
    "- AetherForge has a paper book: members record buys and sells to track a portfolio.",
    "- Trades are recorded, never executed. AetherForge never places orders, never takes custody and never moves money.",
    "- Prices are delayed public data, not a direct NZX or ASX feed.",
    "### Overseas shares (FIF) — indicative only",
    `- The FIF de minimis test: if the total cost of your FIF interests is more than NZ$50,000 at any time in the income year (1 April to 31 March), the FIF rules apply. It is the cost of what you hold at that moment, not the sum of everything held at some point in the year.`,
    `- The limit is ${nz(FIF_THRESHOLD_NZD)}, or ${nz(FIF_JOINT_THRESHOLD_NZD_FACT)} when the portfolio is set to jointly held.`,
    "- This is indicative, not tax advice; the member should confirm with IRD or a tax adviser.",
    "### Outside platforms",
    "- Never recommend, rank or link to a broker, exchange or retailer, and give no referral links or user counts.",
    "- If asked \"which broker should I use?\" (or similar), do not name one: say the choice is theirs and depends on fees, markets and custody.",
    `- Import help may name the supported import files: ${IMPORT_SOURCE_NAMES.join(", ")} activity files and a generic CSV.`,
    "### Money and disclaimer",
    "- Write money as NZ$ or US$, never a bare \"$\".",
    `- End every reply with exactly: "General information, not financial advice."`,
    "### Honesty",
    "- If you are not sure of a fact, say you don't know rather than guess, and point to /pricing, /trust or /how-it-works.",
  ].join("\n");
}

const PRICE_RE = /NZ\$\s?([0-9][0-9,]*)(?:\.\d+)?\s*(?:\/\s*(?:mo|month|yr|year)|per (?:month|year)|a (?:month|year))/gi;

/** Plan-price quotes in a reply that are not in plans.ts (empty = OK). */
export function unknownPlanPrices(reply: string): number[] {
  const allowed = new Set(allowedPlanPricesNzd());
  const bad: number[] = [];
  for (const m of reply.matchAll(PRICE_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!allowed.has(n)) bad.push(n);
  }
  return bad;
}

/** H-10 import sources (broker-import.ts); nameable as import formats only. */
export const IMPORT_SOURCE_NAMES = ["Sharesies", "Hatch", "IBKR"];

/** Names that must not appear when the visitor asks which broker to use. */
export const BANNED_PLATFORM_NAMES = [
  "Sharesies", "Tiger", "Interactive Brokers", "Hatch", "BlackBull", "Binance",
  "OKX", "Bybit", "Coinbase", "Kraken", "Pay It Now",
];
