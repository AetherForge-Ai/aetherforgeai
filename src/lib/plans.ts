import { publicPriceSlot } from "@/lib/public-catalog";

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

/** Free tier — no Stripe price. Matches the public Pricing card. */
export const FREE_PLAN = {
  key: "free" as const,
  name: "Free",
  tagline: "Perfect for testing the platform",
  /** Holdings a free member can track. */
  tickerLimit: 10,
  /** Free members choose Stox or Koins, not both. */
  botAccess: "single" as const,
  /**
   * AI research reports a Free member may run per calendar month (Pacific/Auckland).
   * Enforced by FREE_REPORTS_PER_MONTH / evaluateFreeReportQuota() in entitlements.ts.
   */
  reportsPerMonth: 3,
  /** Free access stays on the account; paid plans add capacity. */
  durationDays: 3650,
  features: [
    "Up to 10 holdings",
    "One of Stox or Koins",
    "Smitty spot prices (read-only)",
    "3 AI research reports per month",
    "20 Market Assistant queries per month",
    "Basic portfolio P/L",
  ],
};

/** Starter AI research reports per Auckland month. Enforced on the report route. */
export const STARTER_REPORTS_PER_MONTH = 15;

/**
 * Market Assistant queries per Auckland month.
 * Free was already capped at 20. Starter and Pro had no coded quota, so the
 * catalog uses 100 and 500. Ultimate and legacy Apex stay uncapped.
 */
export const ASSISTANT_QUERY_LIMITS = {
  free: 20,
  starter: 100,
  pro: 500,
} as const;

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
  /** Shareable Stripe Payment Link. Empty when the plan is not self-serve. */
  paymentLink: string;
  featured?: boolean;
  /**
   * Retired Stripe price kept so existing subscriptions still resolve.
   * Checkout and upgrades must not sell it.
   */
  archived?: boolean;
  features: string[];
}

const APEX_FEATURES = [
  "AI research reports",
  "7-day illustrative scenario ranges",
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

];

const STARTER_FEATURES = [
  "Up to 25 holdings",
  "One of Stox or Koins",
  "Smitty spot prices",
  "Basic Headmaster",
  "15 AI research reports per month",
  "100 Market Assistant queries per month",
  "CSV export",
  "14-day trial",
];

const PRO_FEATURES = [
  "Up to 75 holdings",
  "Stox and Koins",
  "Smitty spot prices",
  "Full Headmaster",
  "Unlimited AI research reports",
  "500 Market Assistant queries per month",
  "CSV export",
  "14-day trial",
];

const ULTIMATE_FEATURES = [
  "Unlimited holdings",
  "Everything in Pro",
  "API access",
  "Up to 5 seats",
  "White-label options",
  "Dedicated support",
];

/**
 * Oct 2026 public Starter and Pro checkout.
 * scripts/reprice-public-tiers.ts writes the new Stripe price IDs and payment
 * links into the strings below. Empty means checkout is not offered yet.
 * Env overrides (no secrets), either form:
 * NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY and
 * NEXT_PUBLIC_STRIPE_PAYMENT_LINK_STARTER_MONTHLY, or
 * STRIPE_PRICE_STARTER_MONTHLY and STRIPE_PAYMENT_LINK_STARTER_MONTHLY.
 * The same pattern applies to STARTER_YEARLY, PRO_MONTHLY, and PRO_YEARLY.
 * Ultimate has no payment link and no env slot.
 */
const PUBLIC_CHECKOUT = {
  starter_monthly: { priceId: "", paymentLink: "" },
  starter_yearly: { priceId: "", paymentLink: "" },
  pro_monthly: { priceId: "", paymentLink: "" },
  pro_yearly: { priceId: "", paymentLink: "" },
} as const;

type PublicCheckoutSlot = keyof typeof PUBLIC_CHECKOUT;

function firstSet(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Env names are written out so Next can inline NEXT_PUBLIC_* into the pricing
 * buttons. STRIPE_PRICE_* / STRIPE_PAYMENT_LINK_* are the same public IDs for
 * the server. A secret key must never be one of these variables.
 */
function publicCheckout(slot: PublicCheckoutSlot, field: "priceId" | "paymentLink"): string {
  const committed = PUBLIC_CHECKOUT[slot][field];
  switch (`${slot}.${field}`) {
    case "starter_monthly.priceId":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY,
        process.env.STRIPE_PRICE_STARTER_MONTHLY,
        committed
      );
    case "starter_monthly.paymentLink":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_STARTER_MONTHLY,
        process.env.STRIPE_PAYMENT_LINK_STARTER_MONTHLY,
        committed
      );
    case "starter_yearly.priceId":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_YEARLY,
        process.env.STRIPE_PRICE_STARTER_YEARLY,
        committed
      );
    case "starter_yearly.paymentLink":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_STARTER_YEARLY,
        process.env.STRIPE_PAYMENT_LINK_STARTER_YEARLY,
        committed
      );
    case "pro_monthly.priceId":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY,
        process.env.STRIPE_PRICE_PRO_MONTHLY,
        committed
      );
    case "pro_monthly.paymentLink":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO_MONTHLY,
        process.env.STRIPE_PAYMENT_LINK_PRO_MONTHLY,
        committed
      );
    case "pro_yearly.priceId":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY,
        process.env.STRIPE_PRICE_PRO_YEARLY,
        committed
      );
    case "pro_yearly.paymentLink":
      return firstSet(
        process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO_YEARLY,
        process.env.STRIPE_PAYMENT_LINK_PRO_YEARLY,
        committed
      );
    default:
      return committed;
  }
}

/** Retired Starter/Pro prices. Existing subscribers stay on these. No payment links. */
export const LEGACY_SUBSCRIPTION_PLANS: Plan[] = [
  {
    key: "starter_monthly",
    name: "Starter",
    tagline: "Retired NZ$29 monthly price",
    price: 29,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 25,
    botAccess: "single",
    durationDays: 30,
    priceId: "price_1TsjfH9sOmzarzYkYpuvCfuA",
    paymentLink: "",
    archived: true,
    features: STARTER_FEATURES,
  },
  {
    key: "starter_yearly",
    name: "Starter",
    tagline: "Retired NZ$290 annual price",
    price: 290,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 25,
    botAccess: "single",
    durationDays: 365,
    priceId: "price_1TsjfH9sOmzarzYkj43Mf2Zh",
    paymentLink: "",
    archived: true,
    features: STARTER_FEATURES,
  },
  {
    key: "pro_monthly",
    name: "Pro",
    tagline: "Retired NZ$69 monthly price",
    price: 69,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 75,
    botAccess: "both",
    durationDays: 30,
    priceId: "price_1TsjfI9sOmzarzYkiDEzedgi",
    paymentLink: "",
    archived: true,
    features: PRO_FEATURES,
  },
  {
    key: "pro_yearly",
    name: "Pro",
    tagline: "Retired NZ$690 annual price",
    price: 690,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 75,
    botAccess: "both",
    durationDays: 365,
    priceId: "price_1TsjfI9sOmzarzYkyyURWr4E",
    paymentLink: "",
    archived: true,
    features: PRO_FEATURES,
  },
];

/* ---------------------------------------------------------------------- */
/*  Public pricing tiers — Starter · Pro · Ultimate (monthly + annual).   */
/*  Ultimate keeps its existing price IDs for subscribers already on it   */
/*  and has no payment link. Starter and Pro checkout uses PUBLIC_CHECKOUT. */
/* ---------------------------------------------------------------------- */
PLANS.push(
  {
    key: "starter_monthly",
    name: "Starter",
    tagline: "For individual investors getting serious",
    price: 16,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 25,
    botAccess: "single",
    durationDays: 30,
    priceId: publicCheckout("starter_monthly", "priceId"),
    paymentLink: publicCheckout("starter_monthly", "paymentLink"),
    features: STARTER_FEATURES,
  },
  {
    key: "starter_yearly",
    name: "Starter",
    tagline: "For individual investors getting serious",
    price: 160,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 25,
    botAccess: "single",
    durationDays: 365,
    priceId: publicCheckout("starter_yearly", "priceId"),
    paymentLink: publicCheckout("starter_yearly", "paymentLink"),
    features: STARTER_FEATURES,
  },
  {
    key: "pro_monthly",
    name: "Pro",
    tagline: "The complete experience for serious investors",
    price: 49,
    interval: "month",
    intervalLabel: "month",
    tickerLimit: 75,
    botAccess: "both",
    durationDays: 30,
    priceId: publicCheckout("pro_monthly", "priceId"),
    paymentLink: publicCheckout("pro_monthly", "paymentLink"),
    featured: true,
    features: PRO_FEATURES,
  },
  {
    key: "pro_yearly",
    name: "Pro",
    tagline: "The complete experience for serious investors",
    price: 490,
    interval: "year",
    intervalLabel: "year",
    tickerLimit: 75,
    botAccess: "both",
    durationDays: 365,
    priceId: publicCheckout("pro_yearly", "priceId"),
    paymentLink: publicCheckout("pro_yearly", "paymentLink"),
    featured: true,
    features: PRO_FEATURES,
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
    priceId: "price_1TsjfJ9sOmzarzYkM1QYb3tU",
    paymentLink: "",
    features: ULTIMATE_FEATURES,
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
    priceId: "price_1TsjfJ9sOmzarzYkRBYlUacp",
    paymentLink: "",
    features: ULTIMATE_FEATURES,
  },
);

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
  /** Display price in whole dollars (NZD). null for the free tier. */
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  /** Plan keys used to look up the Stripe price for checkout (null for free/sales). */
  monthlyPlanKey: PlanKey | null;
  yearlyPlanKey: PlanKey | null;
  cta: { label: string; kind: CtaKind };
  highlights: string[];
  featured?: boolean;
}

/** Yearly price is 10 months of the monthly rate: 1 − 10/12 = 16.666…%. */
export const ANNUAL_SAVINGS_PCT = 16.67;

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
      "Up to 10 holdings",
      "One of Stox or Koins",
      "Smitty spot prices (read-only)",
      "3 AI research reports per month",
      "20 Market Assistant queries per month",
      "Basic portfolio P/L",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    subtitle: "For individual investors getting serious",
    monthlyPrice: 16,
    yearlyPrice: 160,
    monthlyPlanKey: "starter_monthly",
    yearlyPlanKey: "starter_yearly",
    cta: { label: "Start 14-day Starter trial", kind: "checkout" },
    highlights: STARTER_FEATURES,
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "The complete experience for serious investors",
    badge: "Most Popular",
    monthlyPrice: 49,
    yearlyPrice: 490,
    monthlyPlanKey: "pro_monthly",
    yearlyPlanKey: "pro_yearly",
    cta: { label: "Start with Pro", kind: "checkout" },
    featured: true,
    highlights: PRO_FEATURES,
  },
  {
    id: "ultimate",
    name: "Ultimate",
    subtitle: "Founder-led onboarding for teams, API access and custom reporting",
    badge: "Founder-led",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    monthlyPlanKey: null,
    yearlyPlanKey: null,
    cta: { label: "Talk to us", kind: "sales" },
    highlights: ULTIMATE_FEATURES,
  },
];

/** Enquiries contact used by the Ultimate "Talk to us" CTA. Founder-led — not a self-serve checkout push. */
export const SALES_EMAIL = "lukas@aetherforgeai.co.nz";

/** All new-tier Stripe prices are provisioned in NZD. */
export const PRICE_CURRENCY = "NZD";

export function planByKey(key?: string | null): Plan | undefined {
  return PLANS.find((p) => p.key === key);
}

/**
 * Build a shareable Stripe Payment Link URL for a plan, associated with the
 * signed-in user. Stripe attaches `client_reference_id` to the resulting
 * Checkout Session (read back in the webhook to resolve the user) and
 * pre-fills the email. For single-bot plans (Starter) the chosen bot is
 * encoded into the reference as `<userId>__bot-stock|crypto` so the webhook
 * can grant the right entitlement — the dashboard bot-switcher can change it
 * later. Returns null if the plan has no payment link configured.
 */
export function buildPaymentLinkUrl(
  plan: Plan | undefined,
  opts: { userId: string; email?: string | null; bot?: "stock" | "crypto" }
): string | null {
  if (!plan?.paymentLink) return null;
  const ref =
    plan.botAccess === "single" && opts.bot ? `${opts.userId}__bot-${opts.bot}` : opts.userId;
  const params = new URLSearchParams({ client_reference_id: ref });
  if (opts.email) params.set("prefilled_email", opts.email);
  const sep = plan.paymentLink.includes("?") ? "&" : "?";
  return `${plan.paymentLink}${sep}${params.toString()}`;
}

/**
 * Parse a Payment Link `client_reference_id` back into the internal user id
 * and (optional) single-bot choice. Mirrors buildPaymentLinkUrl().
 */
export function parsePaymentLinkRef(
  ref?: string | null
): { userId: string | null; bot: "stock" | "crypto" | null } {
  if (!ref) return { userId: null, bot: null };
  const [userId, botPart] = ref.split("__bot-");
  const bot = botPart === "stock" || botPart === "crypto" ? (botPart as "stock" | "crypto") : null;
  return { userId: userId || null, bot };
}

export function planByPriceId(priceId?: string | null): Plan | undefined {
  if (!priceId) return undefined;
  return (
    PLANS.find((p) => p.priceId === priceId) ??
    LEGACY_SUBSCRIPTION_PLANS.find((p) => p.priceId === priceId)
  );
}

/** Starter and Pro prices that checkout may sell. A committed price id is optional. */
export function isSelfServeCheckoutPlan(plan: Plan | undefined): boolean {
  if (!plan || plan.archived) return false;
  return !!publicPriceSlot(plan.key);
}

/** Human label for a plan key (falls back gracefully for legacy values). */
export function planLabel(key?: string | null): string {
  if (key === "free") return FREE_PLAN.name;
  const p = planByKey(key);
  if (p) return p.name;
  if (key === "none" || !key) return "Free account";
  return key.charAt(0).toUpperCase() + key.slice(1);
}
