#!/usr/bin/env ts-node
/**
 * One-off: make the owner-provided Stripe Payment Links "proper" for the
 * Starter / Pro / Ultimate tiers.
 *
 * For each of the 6 links it:
 *   - adds a real 14-day free trial to the Starter & Pro links (so the pricing
 *     page's "Start 14-day Pro Trial" CTA is truthful),
 *   - stamps `subscription_data.metadata` with { plan, ticker_limit, bot_access }
 *     so the webhook can resolve entitlements straight from the subscription,
 *   - enables promotion codes.
 *
 * Idempotent & safe: only UPDATES the given links (matched by their public URL).
 * Existing subscriptions are untouched — changes apply to future checkouts only.
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

interface LinkDef {
  url: string;
  plan: string;
  ticker_limit: number;
  bot_access: "single" | "both";
  trialDays: number; // 0 = no trial
}

// Order matches the tiers in src/lib/plans.ts (29.99 → starter yearly → up the range).
const LINKS: LinkDef[] = [
  { url: "https://buy.stripe.com/7sYaER8YDdwj8a3bPF1440l", plan: "starter_monthly", ticker_limit: 25, bot_access: "single", trialDays: 14 },
  { url: "https://buy.stripe.com/4gM8wJdeT8bZ1LFg5V1440k", plan: "starter_yearly", ticker_limit: 25, bot_access: "single", trialDays: 14 },
  { url: "https://buy.stripe.com/aFa6oBa2H9g3eyraLB1440j", plan: "pro_monthly", ticker_limit: 75, bot_access: "both", trialDays: 14 },
  { url: "https://buy.stripe.com/7sYbIVgr5fEr0HBg5V1440i", plan: "pro_yearly", ticker_limit: 75, bot_access: "both", trialDays: 14 },
  { url: "https://buy.stripe.com/fZu4gt6QvfEr61V5rh1440h", plan: "ultimate_monthly", ticker_limit: 100000, bot_access: "both", trialDays: 0 },
  { url: "https://buy.stripe.com/4gMbIV3Ej9g38a34nd1440g", plan: "ultimate_yearly", ticker_limit: 100000, bot_access: "both", trialDays: 0 },
];

async function main() {
  const env = loadEnv();
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY missing from .env");
    process.exit(1);
  }
  const mode = key.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.log(`Configuring payment links in ${mode} mode...`);

  const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true });

  // Page through all payment links so we can match by public URL.
  const byUrl = new Map<string, Stripe.PaymentLink>();
  for await (const link of stripe.paymentLinks.list({ limit: 100 })) {
    if (link.url) byUrl.set(link.url, link);
  }

  for (const def of LINKS) {
    const link = byUrl.get(def.url);
    if (!link) {
      console.warn(`  ⚠ No payment link found for ${def.plan} (${def.url}) — skipped`);
      continue;
    }

    const metadata = {
      plan: def.plan,
      ticker_limit: String(def.ticker_limit),
      // Single-bot plans default to "stock"; the per-user choice is still
      // carried via client_reference_id and applied by the webhook.
      bot_access: def.bot_access === "both" ? "both" : "stock",
    };

    const subscription_data: Stripe.PaymentLinkUpdateParams.SubscriptionData = {
      metadata,
    };
    if (def.trialDays > 0) subscription_data.trial_period_days = def.trialDays;

    const updated = await stripe.paymentLinks.update(link.id, {
      allow_promotion_codes: true,
      subscription_data,
    });

    console.log(
      `  ✓ ${def.plan} (${updated.id}) — trial ${def.trialDays || 0}d · meta ${JSON.stringify(metadata)}`
    );
  }

  console.log("\nDone. Payment links are now trial-enabled + metadata-tagged.");
}

main().catch((e) => {
  console.error("Failed to configure payment links:", e?.raw || e);
  process.exit(1);
});
