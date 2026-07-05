#!/usr/bin/env ts-node
/**
 * One-off: create the 4 AetherForge Apex plans (product + recurring price +
 * payment link) in whatever Stripe account STRIPE_SECRET_KEY points at.
 *
 * Prints a JSON map { key: { priceId, paymentLink } } so the resulting IDs can
 * be pasted into src/lib/plans.ts. Idempotent-ish: it always creates fresh
 * products/prices, so only run it when (re)provisioning an account (e.g. going
 * live). Existing test-mode data in another account is untouched.
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

interface PlanDef {
  key: string;
  name: string;
  description: string;
  amount: number; // cents
  interval: "week" | "month" | "year";
  ticker_limit: number;
  bot_access: "single" | "both";
}

const PLAN_DEFS: PlanDef[] = [
  {
    key: "weekly",
    name: "Apex Weekly",
    description: "Full Apex engine · up to 5 tickers · one bot (Stock OR Crypto).",
    amount: 1599,
    interval: "week",
    ticker_limit: 5,
    bot_access: "single",
  },
  {
    key: "monthly",
    name: "Apex Monthly",
    description: "Full Apex engine · up to 10 tickers · one bot (Stock OR Crypto).",
    amount: 4999,
    interval: "month",
    ticker_limit: 10,
    bot_access: "single",
  },
  {
    key: "yearly",
    name: "Apex Yearly",
    description: "Full Apex engine · up to 20 tickers · one bot (Stock OR Crypto).",
    amount: 39999,
    interval: "year",
    ticker_limit: 20,
    bot_access: "single",
  },
  {
    key: "dual_yearly",
    name: "Apex Dual",
    description: "Full Apex engine · up to 20 tickers per bot · BOTH bots (Stock AND Crypto).",
    amount: 59999,
    interval: "year",
    ticker_limit: 20,
    bot_access: "both",
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
  console.log(`Provisioning Apex plans in ${mode} mode...`);

  const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true });

  const out: Record<string, { priceId: string; paymentLink: string }> = {};

  for (const def of PLAN_DEFS) {
    const product = await stripe.products.create({
      name: `AetherForge ${def.name}`,
      description: def.description,
      metadata: { plan: def.key, ticker_limit: String(def.ticker_limit), bot_access: def.bot_access },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: def.amount,
      currency: "usd",
      recurring: { interval: def.interval },
      nickname: def.name,
      metadata: { plan: def.key, ticker_limit: String(def.ticker_limit), bot_access: def.bot_access },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { plan: def.key, ticker_limit: String(def.ticker_limit), bot_access: def.bot_access },
      // Carry plan metadata onto the resulting subscription so the webhook can
      // resolve entitlements even for Payment-Link checkouts.
      subscription_data: {
        metadata: { plan: def.key, ticker_limit: String(def.ticker_limit), bot_access: def.bot_access },
      },
    });

    out[def.key] = { priceId: price.id, paymentLink: link.url };
    console.log(`  ✓ ${def.name}: ${price.id}  ${link.url}`);
  }

  console.log("\n=== RESULT JSON (paste into src/lib/plans.ts) ===");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("Failed to provision plans:", e?.raw || e);
  process.exit(1);
});
