/**
 * CR-2: facts the assistants may state, generated from the single sources of truth
 * (plans.ts for prices). Pure module so tests and both chat prompts share it.
 */
import { PRICING_TIERS, PRICE_CURRENCY } from "@/lib/plans";

export const FIF_THRESHOLD_NZD = 50_000;
export const FIF_JOINT_THRESHOLD_NZD_FACT = 100_000;

/** b37 CR-2: true for any FIF / de minimis / joint-threshold question (static path, no model). */
export const FIF_INTENT_RE =
  /de minimis|(fif|foreign investment fund).*(threshold|limit|exempt|50|100)|(threshold|limit|exempt).*(fif|overseas|foreign|offshore)|50,?000|\b50k\b|100,?000|\b100k\b|\bjoint(ly)?\b.*(threshold|limit|portfolio|hold|own|fif)|\b(partner|spouse|couple|couples|trust|company)\b.*(threshold|limit|fif|overseas|100)/;

/**
 * b37 CR-2 (Chief, Research FS 2 para 9): the one FIF answer every assistant gives. It's static, never
 * from the model or a cache. The NZ$50,000 threshold is per natural person, based on their share of the
 * cost. It never doubles for a joint portfolio, and trusts and companies don't get the exemption.
 */
export const FIF_JOINT_NO = "No, a jointly held portfolio does not get a doubled NZ$100,000 threshold.";
const JOINT_ASK_RE = /joint|partner|spouse|couple|double|100,?000|100k|together|both of us|trust|company/;

/** b38 CR-2 (P1): Chief's exact core wording; extra facts follow it. */
export const FIF_CORE_RULE =
  "The NZ$50,000 threshold applies per person, based on total cost at any time in the year; joint holdings are split between the owners, so 2 equal owners can together hold up to NZ$100,000 in cost; it's not a doubled threshold for the portfolio.";
export const FIF_STATIC_ANSWER =
  `${FIF_CORE_RULE} Cost means purchase price including fees, at any time in the income year (1 April to 31 March). New Zealand shares and most ASX-listed shares (Australian-resident, on the approved list) are excluded and add nothing to that cost. Trusts and companies don't get the NZ$50,000 exemption. Indicative, not tax advice`;

const fmtNz = (n: number) => `NZ$${Math.round(n).toLocaleString("en-NZ")}`;

/** b38 CR-2: the first NZ$ amount in the question ("NZ$80,000", "$80k", "80 000"), or null. */
export function questionAmountNzd(q: string): number | null {
  const m = q.match(/(?:nz)?\$?\s?(\d{1,3}(?:[ ,]\d{3})+|\d+(?:\.\d+)?)\s?(k|thousand)?\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[ ,]/g, "")) * (m[2] ? 1000 : 1);
  return n >= 1000 && n <= 100_000_000 ? n : null;
}

/**
 * b38 CR-2 (TT b37): "a couple with ~NZ$80,000 at cost" is answered directly first: each of 2 equal
 * owners holds half the cost, measured against their own NZ$50,000.
 */
export function jointAmountLine(q: string): string | null {
  if (!/couple|partner|spouse|joint|both of us|together|2 of us|two of us/.test(q)) return null;
  const total = questionAmountNzd(q.replace(/50,?000|50k|100,?000|100k/g, " "));
  if (total == null) return null;
  const each = total / 2;
  const under = each <= FIF_THRESHOLD_NZD;
  return `If you own it in equal shares, each of you holds ${fmtNz(each)} of the ${fmtNz(total)} cost, which is ${
    under ? "under" : "over"
  } the per-person ${fmtNz(FIF_THRESHOLD_NZD)} threshold${under ? " (as long as neither of you holds other FIF interests that take your own total over it)" : ", so the FIF rules apply to each of you"}.`;
}

export function fifStaticReply(userMessage: string): string | null {
  const q = String(userMessage || "").toLowerCase();
  if (!FIF_INTENT_RE.test(q)) return null;
  const direct = JOINT_ASK_RE.test(q) ? jointAmountLine(q) : null;
  if (direct) return `${direct} ${FIF_STATIC_ANSWER}.`;
  return JOINT_ASK_RE.test(q) ? `${FIF_JOINT_NO} ${FIF_STATIC_ANSWER}.` : `${FIF_STATIC_ANSWER}.`;
}

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
    "### Overseas shares (FIF) — Indicative, not tax advice",
    `- The FIF de minimis test: if the total cost of your FIF interests is more than NZ$50,000 at any time in the income year (1 April to 31 March), the FIF rules apply. It is the cost of what you hold at that moment, not the sum of everything held at some point in the year.`,
    `- Use this wording: "${FIF_CORE_RULE}" Trusts and companies don't get the exemption. Never say the limit "doubles" and never answer "yes" to "is my threshold NZ$100,000?". End with "Indicative, not tax advice."`,
    "- End any FIF answer with \"Indicative, not tax advice\"; the member should confirm with IRD or a tax adviser.",
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
