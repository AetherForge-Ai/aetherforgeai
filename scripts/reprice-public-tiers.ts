#!/usr/bin/env ts-node
/**
 * Create the Oct 2026 Starter and Pro prices and payment links.
 *
 * Prices are immutable. This script never updates unit_amount on an existing
 * Price and never deletes a Price. Existing subscriptions are not changed.
 * Ultimate gets no new price. The old Starter, Pro, and Ultimate payment links
 * are archived (active: false).
 *
 * Reads STRIPE_SECRET_KEY from .env. Prints price IDs and payment-link URLs
 * only. Does not print the secret key.
 *
 * A test-mode key never writes the live price IDs in src/lib/plans.ts.
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
      if (k && rest.length) env[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    });
  return env;
}

const LIVE_PRICE_IDS = {
  starter_monthly: "price_1TsjfH9sOmzarzYkYpuvCfuA",
  starter_yearly: "price_1TsjfH9sOmzarzYkj43Mf2Zh",
  pro_monthly: "price_1TsjfI9sOmzarzYkiDEzedgi",
  pro_yearly: "price_1TsjfI9sOmzarzYkyyURWr4E",
  ultimate_monthly: "price_1TsjfJ9sOmzarzYkM1QYb3tU",
  ultimate_yearly: "price_1TsjfJ9sOmzarzYkRBYlUacp",
} as const;

const RETIRED_LINKS = [
  "https://buy.stripe.com/7sYaER8YDdwj8a3bPF1440l",
  "https://buy.stripe.com/4gM8wJdeT8bZ1LFg5V1440k",
  "https://buy.stripe.com/aFa6oBa2H9g3eyraLB1440j",
  "https://buy.stripe.com/7sYbIVgr5fEr0HBg5V1440i",
  "https://buy.stripe.com/fZu4gt6QvfEr61V5rh1440h",
  "https://buy.stripe.com/4gMbIV3Ej9g38a34nd1440g",
];

interface Slot {
  key: "starter_monthly" | "starter_yearly" | "pro_monthly" | "pro_yearly";
  oldPriceId: string;
  unitAmount: number;
  interval: "month" | "year";
  tickerLimit: string;
  botAccess: "single" | "both";
}

const SLOTS: Slot[] = [
  {
    key: "starter_monthly",
    oldPriceId: LIVE_PRICE_IDS.starter_monthly,
    unitAmount: 1600,
    interval: "month",
    tickerLimit: "25",
    botAccess: "single",
  },
  {
    key: "starter_yearly",
    oldPriceId: LIVE_PRICE_IDS.starter_yearly,
    unitAmount: 16000,
    interval: "year",
    tickerLimit: "25",
    botAccess: "single",
  },
  {
    key: "pro_monthly",
    oldPriceId: LIVE_PRICE_IDS.pro_monthly,
    unitAmount: 4900,
    interval: "month",
    tickerLimit: "75",
    botAccess: "both",
  },
  {
    key: "pro_yearly",
    oldPriceId: LIVE_PRICE_IDS.pro_yearly,
    unitAmount: 49000,
    interval: "year",
    tickerLimit: "75",
    botAccess: "both",
  },
];

const CATALOG = "2026-10-public";

function completionFrom(link: Stripe.PaymentLink): Stripe.PaymentLinkCreateParams.AfterCompletion {
  const done = link.after_completion;
  if (done?.type === "redirect" && done.redirect?.url) {
    return { type: "redirect", redirect: { url: done.redirect.url } };
  }
  const message = done?.hosted_confirmation?.custom_message;
  if (message) return { type: "hosted_confirmation", hosted_confirmation: { custom_message: message } };
  return { type: "hosted_confirmation" };
}

function writeCheckout(created: Record<string, { priceId: string; paymentLink: string }>) {
  const plansPath = path.join(process.cwd(), "src/lib/plans.ts");
  const source = fs.readFileSync(plansPath, "utf8");
  const next = `const PUBLIC_CHECKOUT = {
  starter_monthly: { priceId: "${created.starter_monthly.priceId}", paymentLink: "${created.starter_monthly.paymentLink}" },
  starter_yearly: { priceId: "${created.starter_yearly.priceId}", paymentLink: "${created.starter_yearly.paymentLink}" },
  pro_monthly: { priceId: "${created.pro_monthly.priceId}", paymentLink: "${created.pro_monthly.paymentLink}" },
  pro_yearly: { priceId: "${created.pro_yearly.priceId}", paymentLink: "${created.pro_yearly.paymentLink}" },
} as const;`;
  const pattern = /const PUBLIC_CHECKOUT = \{[\s\S]*?\} as const;/;
  if (!pattern.test(source)) throw new Error("PUBLIC_CHECKOUT block not found in src/lib/plans.ts");
  fs.writeFileSync(plansPath, source.replace(pattern, next));
}

async function main() {
  const env = { ...process.env, ...loadEnv() };
  const key = env.STRIPE_SECRET_KEY || "";
  if (!key) {
    console.error("STRIPE_SECRET_KEY missing. No Stripe prices or payment links were created.");
    console.error("Live price IDs left untouched:");
    for (const [name, id] of Object.entries(LIVE_PRICE_IDS)) console.error(`  ${name} ${id}`);
    process.exit(1);
  }
  const testMode = key.startsWith("sk_test_");
  console.log(testMode ? "Stripe mode: TEST" : "Stripe mode: LIVE");

  const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true });

  const oldPrices = new Map<string, Stripe.Price>();
  for (const slot of SLOTS) {
    try {
      oldPrices.set(slot.key, await stripe.prices.retrieve(slot.oldPriceId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "retrieve failed";
      console.error(`Could not retrieve ${slot.key} (${slot.oldPriceId}): ${message}`);
    }
  }
  if (oldPrices.size !== SLOTS.length) {
    console.error("Stopped before creating prices. Live catalog IDs were not modified:");
    for (const [name, id] of Object.entries(LIVE_PRICE_IDS)) console.error(`  ${name} ${id}`);
    process.exit(1);
  }

  const linksByUrl = new Map<string, Stripe.PaymentLink>();
  for await (const link of stripe.paymentLinks.list({ limit: 100, active: true })) {
    if (link.url) linksByUrl.set(link.url, link);
  }
  for await (const link of stripe.paymentLinks.list({ limit: 100, active: false })) {
    if (link.url && !linksByUrl.has(link.url)) linksByUrl.set(link.url, link);
  }

  const sample = linksByUrl.get(RETIRED_LINKS[0]);
  const after = sample ? completionFrom(sample) : ({ type: "hosted_confirmation" } as const);
  console.log(`Payment link completion copied from current Starter monthly link: ${after.type}`);
  if (after.type === "redirect") console.log(`Redirect URL: ${after.redirect?.url}`);

  const created: Record<string, { priceId: string; paymentLink: string }> = {};

  for (const slot of SLOTS) {
    const old = oldPrices.get(slot.key)!;
    const productId = typeof old.product === "string" ? old.product : old.product.id;
    const existing = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    let price = existing.data.find(
      (p) =>
        p.currency === "nzd" &&
        p.unit_amount === slot.unitAmount &&
        p.recurring?.interval === slot.interval &&
        p.metadata?.aetherforge_catalog === CATALOG &&
        p.metadata?.plan === slot.key
    );
    if (!price) {
      price = await stripe.prices.create({
        product: productId,
        currency: "nzd",
        unit_amount: slot.unitAmount,
        recurring: { interval: slot.interval },
        nickname: `${slot.key} NZD ${CATALOG}`,
        metadata: {
          plan: slot.key,
          ticker_limit: slot.tickerLimit,
          bot_access: slot.botAccess,
          aetherforge_catalog: CATALOG,
        },
      });
      console.log(`Created price ${slot.key} ${price.id}`);
    } else {
      console.log(`Reused price ${slot.key} ${price.id}`);
    }

    const metadata = {
      plan: slot.key,
      ticker_limit: slot.tickerLimit,
      bot_access: slot.botAccess === "both" ? "both" : "stock",
      aetherforge_catalog: CATALOG,
    };
    let url = "";
    for (const link of linksByUrl.values()) {
      if (link.metadata?.plan === slot.key && link.metadata?.aetherforge_catalog === CATALOG && link.active && link.url) {
        url = link.url;
      }
    }
    if (!url) {
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        allow_promotion_codes: true,
        payment_method_collection: "always",
        subscription_data: {
          trial_period_days: 14,
          metadata,
        },
        metadata,
        after_completion: after,
      });
      url = link.url;
      console.log(`Created payment link ${slot.key} ${url}`);
    } else {
      console.log(`Reused payment link ${slot.key} ${url}`);
    }
    created[slot.key] = { priceId: price.id, paymentLink: url };
  }

  for (const url of RETIRED_LINKS) {
    const link = linksByUrl.get(url);
    if (!link) {
      console.log(`Retired link not in this Stripe account (left untouched): ${url}`);
      continue;
    }
    if (link.active) {
      await stripe.paymentLinks.update(link.id, { active: false });
      console.log(`Archived payment link ${link.id}`);
    } else {
      console.log(`Payment link already inactive ${link.id}`);
    }
  }

  if (testMode) {
    console.log("Test mode: plans.ts was not updated with these IDs.");
    console.log("Live price IDs not touched:");
    for (const [name, id] of Object.entries(LIVE_PRICE_IDS)) console.log(`  ${name} ${id}`);
  } else {
    writeCheckout(created);
    console.log("Updated src/lib/plans.ts PUBLIC_CHECKOUT.");
  }

  console.log(JSON.stringify(created, null, 2));
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : "Stripe reprice failed";
  console.error(message);
  process.exit(1);
});
