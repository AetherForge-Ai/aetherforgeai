/**
 * AetherForge Zenith subscription plans — single source of truth.
 *
 * Pure module (safe on client and server). The Stripe price IDs and payment
 * links below were created in the connected Stripe account via the setup script
 * and are matched back to app-level plan metadata (ticker limits, bot access,
 * billing period) here so the pricing page, checkout route and webhook all
 * agree on what each plan unlocks.
 */

export type PlanKey = "weekly" | "monthly" | "yearly" | "dual_yearly";
export type BotAccess = "single" | "both";

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

const ZENITH_FEATURES = [
  "SuperGrok 4.3 ULTRA ADVANCED Zenith-State reports",
  "7-day short-term predictions",
  "3 forward pathways — safe · medium-risk · volatile",
  "12-month momentum & continuation graphs",
  "Daily orchestrated email briefings",
];

export const PLANS: Plan[] = [
  {
    key: "weekly",
    name: "Zenith Weekly",
    tagline: "Try the full Zenith engine",
    price: 15.99,
    interval: "week",
    intervalLabel: "week",
    tickerLimit: 5,
    botAccess: "single",
    durationDays: 7,
    priceId: "price_1TofCc8sKftsmAmpP0HNkyXk",
    paymentLink: "https://buy.stripe.com/test_fZudR3d2tc7f5TF9Qm2ZO00",
    features: ["Monitors up to 5 tickers", "One bot — Stock OR Crypto", ...ZENITH_FEATURES],
  },
  {
    key: "monthly",
    name: "Zenith Monthly",
    tagline: "For the active investor",
    price: 49.99,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 10,
    botAccess: "single",
    durationDays: 30,
    priceId: "price_1TofCd8sKftsmAmpsBSVKDOD",
    paymentLink: "https://buy.stripe.com/test_8x200d2nP2wF0zl5A62ZO01",
    featured: true,
    features: ["Monitors up to 10 tickers", "One bot — Stock OR Crypto", ...ZENITH_FEATURES],
  },
  {
    key: "yearly",
    name: "Zenith Yearly",
    tagline: "Best value for one market",
    price: 399.99,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 20,
    botAccess: "single",
    durationDays: 365,
    priceId: "price_1TofCe8sKftsmAmpYG3am28l",
    paymentLink: "https://buy.stripe.com/test_dRmdR36E58V32Ht8Mi2ZO02",
    features: ["Monitors up to 20 tickers", "One bot — Stock OR Crypto", ...ZENITH_FEATURES],
  },
  {
    key: "dual_yearly",
    name: "Zenith Dual",
    tagline: "Both markets. Maximum edge.",
    price: 599.99,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 20,
    botAccess: "both",
    durationDays: 365,
    priceId: "price_1TofCg8sKftsmAmpVNW3OYEX",
    paymentLink: "https://buy.stripe.com/test_dRm5kx8Md4EN0zl9Qm2ZO03",
    features: [
      "Monitors up to 20 tickers per bot",
      "BOTH bots — Stock AND Crypto",
      ...ZENITH_FEATURES,
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
  const p = planByKey(key);
  if (p) return p.name;
  if (key === "none" || !key) return "Free account";
  return key.charAt(0).toUpperCase() + key.slice(1);
}
