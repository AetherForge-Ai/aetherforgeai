/**
 * AetherForge Apex subscription plans — single source of truth.
 *
 * Pure module (safe on client and server). The Stripe price IDs and payment
 * links below were created in the connected Stripe account via the setup script
 * and are matched back to app-level plan metadata (ticker limits, bot access,
 * billing period) here so the pricing page, checkout route and webhook all
 * agree on what each plan unlocks.
 */

export type PlanKey = "free" | "weekly" | "monthly" | "yearly" | "dual_yearly";
export type BotAccess = "single" | "both";

/** Free-trial tier — no Stripe price, activated instantly with just an email. */
export const FREE_PLAN = {
  key: "free" as const,
  name: "Apex Free Trial",
  tagline: "Run the full engine — free, forever",
  /** Tickers a free member can monitor across both bots. */
  tickerLimit: 3,
  /** Free members can run BOTH the stock and crypto monitors. */
  botAccess: "both" as const,
  /** Free trials stay active for this many days before a gentle nudge to upgrade. */
  durationDays: 3650,
  features: [
    "1 full SuperGrok 4.3 ULTRA ADVANCED report engine",
    "Monitor up to 3 tickers — stocks or crypto",
    "Reports delivered to your email + dashboard",
    "Download every report as a PDF",
    "Share-price alerts with execution instructions",
  ],
};

export interface Plan {
  key: PlanKey;
  name: string;
  /** Short marketing tagline shown under the plan name. */
  tagline: string;
  /** Price in whole dollars (display). */
  price: number;
  /** Billing interval. */
  interval: "week" | "month" | "year";
  intervalLabel: string;
  /** Max tickers this plan can monitor (per bot). */
  tickerLimit: number;
  /** "single" = pick Stock OR Crypto bot. "both" = both bots included. */
  botAccess: BotAccess;
  /** Approx. active-period length in days (used to compute expiry as a fallback). */
  durationDays: number;
  /** Live Stripe price id. */
  priceId: string;
  /** Shareable Stripe Payment Link the owner can activate/share. */
  paymentLink: string;
  featured?: boolean;
  features: string[];
}

const APEX_FEATURES = [
  "SuperGrok 4.3 ULTRA ADVANCED Apex-State reports",
  "7-day short-term predictions",
  "3 forward pathways — safe · medium-risk · volatile",
  "12-month momentum & continuation graphs",
  "Daily orchestrated email briefings",
];

export const PLANS: Plan[] = [
  {
    key: "weekly",
    name: "Apex Weekly",
    tagline: "Try the full Apex engine",
    price: 15.99,
    interval: "week",
    intervalLabel: "week",
    tickerLimit: 5,
    botAccess: "single",
    durationDays: 7,
    priceId: "price_1TpInW9sOmzarzYk2cX8CdJc",
    paymentLink: "https://buy.stripe.com/28E7sF1wb0Jx4XRf1R14403",
    features: ["Monitors up to 5 tickers", "One bot — Stock OR Crypto", ...APEX_FEATURES],
  },
  {
    key: "monthly",
    name: "Apex Monthly",
    tagline: "For the active investor",
    price: 49.99,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 10,
    botAccess: "single",
    durationDays: 30,
    priceId: "price_1TpIsn9sOmzarzYkmOUpjPhK",
    paymentLink: "https://buy.stripe.com/fZu28lfn1gIvgGz2f514404",
    featured: true,
    features: ["Monitors up to 10 tickers", "One bot — Stock OR Crypto", ...APEX_FEATURES],
  },
  {
    key: "yearly",
    name: "Apex Yearly",
    tagline: "Best value for one market",
    price: 399.99,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 20,
    botAccess: "single",
    durationDays: 365,
    priceId: "price_1TpIwz9sOmzarzYkkaygTjUu",
    paymentLink: "https://buy.stripe.com/5kQ7sFb6Lbobeyr06X14405",
    features: ["Monitors up to 20 tickers", "One bot — Stock OR Crypto", ...APEX_FEATURES],
  },
  {
    key: "dual_yearly",
    name: "Apex Dual",
    tagline: "Both markets. Maximum edge.",
    price: 599.99,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 20,
    botAccess: "both",
    durationDays: 365,
    priceId: "price_1TpIz39sOmzarzYkN3ReXDUw",
    paymentLink: "https://buy.stripe.com/dRm28l5Mr0Jx8a36vl14407",
    features: [
      "Monitors up to 20 tickers per bot",
      "BOTH bots — Stock AND Crypto",
      ...APEX_FEATURES,
    ],
  },
];

export function planByKey(key?: string | null): Plan | undefined {
  return PLANS.find((p) => p.key === key);
}

export function planByPriceId(priceId?: string | null): Plan | undefined {
  return PLANS.find((p) => p.priceId === priceId);
}

/** Human label for a plan key (falls back gracefully for legacy values). */
export function planLabel(key?: string | null): string {
  if (key === "free") return FREE_PLAN.name;
  const p = planByKey(key);
  if (p) return p.name;
  if (key === "none" || !key) return "Free account";
  return key.charAt(0).toUpperCase() + key.slice(1);
}
