#!/usr/bin/env ts-node
/**
 * One-off: provision the NEW public pricing tiers (Starter / Pro / Ultimate),
 * each with a monthly AND an annual recurring price, in whatever Stripe account
 * STRIPE_SECRET_KEY points at.
 *
 * Additive & safe: it only CREATES new products/prices — existing Apex plans and
 * any live subscriptions are left completely untouched. Prints a JSON map so the
 * resulting price IDs can be pasted into src/lib/plans.ts.
 */

import * as fs from "fs";
import * as path from "path";
import Stripe from "stripe";

function loadEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env");
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const [k, ...rest] = t.split("=");
      if (k && rest.length) env[k.trim()] = rest.join("=").trim();
    });
  return env;
}

interface TierDef {
  tier: string; // starter | pro | ultimate
  name: string;
  description: string;
  ticker_limit: number;
  bot_access: "single" | "both";
  monthly: number; // cents
  yearly: number; // cents
}

const TIER_DEFS: TierDef[] = [
  {
    tier: "starter",
    name: "Starter",
    description: "For individual investors getting serious · up to 25 holdings · one bot (Stox or Koins).",
    ticker_limit: 25,
    bot_access: "single",
    monthly: 2900,
    yearly: 29000,
  },
  {
    tier: "pro",
    name: "Pro",
    description: "The complete experience · up to 75 holdings · both Stox + Koins · full Totalum architect.",
    ticker_limit: 75,
    bot_access: "both",
    monthly: 6900,
    yearly: 69000,
  },
  {
    tier: "ultimate",
    name: "Ultimate",
    description: "For family offices, advisors & power users · unlimited holdings · API + team seats.",
    ticker_limit: 100000,
    bot_access: "both",
    monthly: 19900,
    yearly: 199000,
  },
];

async function main() {
  const env = loadEnv();
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY missing from .env");
    process.exit(1);
  }
  const mode = key.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.log(`Provisioning tier plans in ${mode} mode...`);

  const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true });

  const out: Record<string, { monthlyPriceId: string; yearlyPriceId: string }> = {};

  for (const def of TIER_DEFS) {
    const meta = {
      tier: def.tier,
      ticker_limit: String(def.ticker_limit),
      bot_access: def.bot_access,
    };

    const product = await stripe.products.create({
      name: `AetherForge ${def.name}`,
      description: def.description,
      metadata: meta,
    });

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: def.monthly,
      currency: "usd",
      recurring: { interval: "month" },
      nickname: `${def.name} Monthly`,
      metadata: { ...meta, plan: `${def.tier}_monthly` },
    });

    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: def.yearly,
      currency: "usd",
      recurring: { interval: "year" },
      nickname: `${def.name} Annual`,
      metadata: { ...meta, plan: `${def.tier}_yearly` },
    });

    out[def.tier] = { monthlyPriceId: monthly.id, yearlyPriceId: yearly.id };
    console.log(`  ✓ ${def.name}: monthly ${monthly.id} · yearly ${yearly.id}`);
  }

  console.log("\n=== RESULT JSON (paste into src/lib/plans.ts) ===");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("Failed to provision tier plans:", e?.raw || e);
  process.exit(1);
});
