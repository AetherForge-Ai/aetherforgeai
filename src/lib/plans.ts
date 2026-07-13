/**
 * AetherForge Apex subscription plans — single source of truth.
 *
 * Pure module (safe on client and server). The Stripe price IDs and payment
 * links below were created in the connected Stripe account via the setup script
 * and are matched back to app-level plan metadata (ticker limits, bot access,
 * billing period) here so the pricing page, checkout route and webhook all
 * agree on what each plan unlocks.
 */

export type PlanKey =
  | "free"
  | "weekly"
  | "monthly"
  | "yearly"
  | "dual_yearly"
  // New public tiers (each has a monthly + annual Stripe price):
  | "starter_monthly"
  | "starter_yearly"
  | "pro_monthly"
  | "pro_yearly"
  | "ultimate_monthly"
  | "ultimate_yearly";
export type BotAccess = "single" | "both";

/** Free-trial tier — no Stripe price, activated instantly with just an email. */
export const FREE_PLAN = {
  key: "free" as const,
  name: "Apex Free Trial",
  tagline: "Run the full engine — free, forever",
  /** Tickers a free member can monitor across both bots. */
  tickerLimit: 8,
  /** Free members can run BOTH the stock and crypto monitors. */
  botAccess: "both" as const,
  /** Free trials stay active for this many days before a gentle nudge to upgrade. */
  durationDays: 3650,
  features: [
    "1 full SuperGrok 4.3 ULTRA ADVANCED report engine",
    "Monitor up to 8 tickers — stocks or crypto",
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
  "SuperGrok 4.3 Ultra Advanced ZENITH State reports",
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
    priceId: "price_1TpjWn9sOmzarzYkOKrjxENo",
    paymentLink: "https://buy.stripe.com/cNi9AN4Incsf61V7zp1440f",
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
    priceId: "price_1TpjXl9sOmzarzYkMsCPJyCU",
    paymentLink: "https://buy.stripe.com/8x23cp0s7fEr61VdXN1440e",
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
    priceId: "price_1TpjYP9sOmzarzYknojwmlfm",
    paymentLink: "https://buy.stripe.com/5kQ3cpgr577V3TN9Hx1440d",
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
    priceId: "price_1TpjYy9sOmzarzYkDjA3ZVLq",
    paymentLink: "https://buy.stripe.com/6oU6oB7UzcsfeyraLB1440c",
    features: [
      "Monitors up to 20 tickers per bot",
      "BOTH bots — Stock AND Crypto",
      ...APEX_FEATURES,
    ],
  },

  /* ---------------------------------------------------------------------- */
  /*  Public pricing tiers — Starter · Pro · Ultimate (monthly + annual).   */
  /*  These back the /pricing page. Each price is a real live Stripe price;  */
  /*  the checkout route + webhook resolve entitlements from tickerLimit /   */
  /*  botAccess below via planByPriceId().                                   */
  /* ---------------------------------------------------------------------- */
  {
    key: "starter_monthly",
    name: "Starter",
    tagline: "For individual investors getting serious",
    price: 29,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 25,
    botAccess: "single",
    durationDays: 30,
    priceId: "price_1TsjEb9sOmzarzYkmXlKQStz",
    paymentLink: "",
    features: ["Up to 25 holdings", "One bot — Stox OR Koins", "15 AI research reports / month"],
  },
  {
    key: "starter_yearly",
    name: "Starter",
    tagline: "For individual investors getting serious",
    price: 290,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 25,
    botAccess: "single",
    durationDays: 365,
    priceId: "price_1TsjEc9sOmzarzYkt7p2QVRu",
    paymentLink: "",
    features: ["Up to 25 holdings", "One bot — Stox OR Koins", "15 AI research reports / month"],
  },
  {
    key: "pro_monthly",
    name: "Pro",
    tagline: "The complete experience for serious investors",
    price: 69,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 75,
    botAccess: "both",
    durationDays: 30,
    priceId: "price_1TsjEc9sOmzarzYk25wD2UxB",
    paymentLink: "",
    featured: true,
    features: ["Up to 75 holdings", "Both Stox + Koins", "Unlimited AI research reports", "Full Totalum architect"],
  },
  {
    key: "pro_yearly",
    name: "Pro",
    tagline: "The complete experience for serious investors",
    price: 690,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 75,
    botAccess: "both",
    durationDays: 365,
    priceId: "price_1TsjEd9sOmzarzYkHmr6FBrz",
    paymentLink: "",
    featured: true,
    features: ["Up to 75 holdings", "Both Stox + Koins", "Unlimited AI research reports", "Full Totalum architect"],
  },
  {
    key: "ultimate_monthly",
    name: "Ultimate",
    tagline: "For family offices, advisors & power users",
    price: 199,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 100000,
    botAccess: "both",
    durationDays: 30,
    priceId: "price_1TsjEd9sOmzarzYkQsfhWMul",
    paymentLink: "",
    features: ["Unlimited holdings", "Everything in Pro", "API access + up to 5 team seats"],
  },
  {
    key: "ultimate_yearly",
    name: "Ultimate",
    tagline: "For family offices, advisors & power users",
    price: 1990,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 100000,
    botAccess: "both",
    durationDays: 365,
    priceId: "price_1TsjEd9sOmzarzYkKSXijmZc",
    paymentLink: "",
    features: ["Unlimited holdings", "Everything in Pro", "API access + up to 5 team seats"],
  },
];

/* -------------------------------------------------------------------------- */
/*  Public pricing-page tier model                                            */
/*  A "tier" bundles a monthly + annual plan under one marketing card. The    */
/*  /pricing page renders from PRICING_TIERS; the billing toggle simply picks */
/*  which plan key (and therefore Stripe price) a card's CTA checks out with. */
/* -------------------------------------------------------------------------- */

export type TierId = "free" | "starter" | "pro" | "ultimate";
export type CtaKind = "register" | "checkout" | "sales";

export interface PricingTier {
  id: TierId;
  name: string;
  subtitle: string;
  badge?: string;
  /** Display price in whole dollars (USD). null for the free tier. */
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  /** Plan keys used to look up the Stripe price for checkout (null for free/sales). */
  monthlyPlanKey: PlanKey | null;
  yearlyPlanKey: PlanKey | null;
  cta: { label: string; kind: CtaKind };
  highlights: string[];
  featured?: boolean;
}

/** ~18% annual saving is baked into the annual prices above (10 months for 12). */
export const ANNUAL_SAVINGS_PCT = 18;

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    subtitle: "Perfect for testing the platform",
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyPlanKey: null,
    yearlyPlanKey: null,
    cta: { label: "Start Free – No Card Required", kind: "register" },
    highlights: [
      "Up to 8 holdings",
      "Access to either Stox or Koins (choose one)",
      "3 AI Research Reports per month",
      "Basic portfolio tracking & P/L",
      "Limited Market Assistant queries",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    subtitle: "For individual investors getting serious",
    monthlyPrice: 29,
    yearlyPrice: 290,
    monthlyPlanKey: "starter_monthly",
    yearlyPlanKey: "starter_yearly",
    cta: { label: "Start 14-day Pro Trial", kind: "checkout" },
    highlights: [
      "Up to 25 holdings",
      "Full access to one bot (Stox or Koins)",
      "15 AI Research Reports per month",
      "Basic Totalum portfolio insights",
      "Priority report generation",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "The complete experience for serious investors",
    badge: "Most Popular",
    monthlyPrice: 69,
    yearlyPrice: 690,
    monthlyPlanKey: "pro_monthly",
    yearlyPlanKey: "pro_yearly",
    cta: { label: "Start 14-day Pro Trial", kind: "checkout" },
    featured: true,
    highlights: [
      "Up to 75 holdings",
      "Full access to both Stox + Koins",
      "Unlimited AI Research Reports",
      "Full Totalum (Master Portfolio Architect)",
      "Advanced strategy simulation & risk analysis",
      "Priority processing + faster reports",
    ],
  },
  {
    id: "ultimate",
    name: "Ultimate",
    subtitle: "For family offices, advisors & power users",
    badge: "Best Value for Heavy Users",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    monthlyPlanKey: "ultimate_monthly",
    yearlyPlanKey: "ultimate_yearly",
    cta: { label: "Talk to Sales", kind: "sales" },
    highlights: [
      "Unlimited holdings",
      "Everything in Pro",
      "API access",
      "Team seats (up to 5 users)",
      "Custom report templates & white-label options",
      "Dedicated support + strategy calls",
      "Advanced scenario modelling & stress testing",
    ],
  },
];

/** Sales contact used by the Ultimate "Talk to Sales" CTA. */
export const SALES_EMAIL = "sales@aetherforgeai.co.nz";

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
