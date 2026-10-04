/**
 * Find or create one Oct 2026 Starter/Pro Price.
 * Reads STRIPE_SECRET_KEY through getStripe(), the same way the rest of the
 * server reads it. Does not print the key, write it, or edit an existing Price.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { PUBLIC_CATALOG, publicPriceSlot, type PublicCatalogKey } from "@/lib/public-catalog";

function productIdOf(price: Stripe.Price): string {
  return typeof price.product === "string" ? price.product : price.product.id;
}

export async function ensurePublicPrice(key: PublicCatalogKey): Promise<string> {
  const slot = publicPriceSlot(key);
  if (!slot) throw new Error("That plan is not a public checkout price.");

  const stripe = getStripe();
  const retired = await stripe.prices.retrieve(slot.retiredPriceId);
  const product = productIdOf(retired);
  const existing = await stripe.prices.list({ product, active: true, limit: 100 });
  const match = existing.data.find(
    (price) =>
      price.currency === "nzd" &&
      price.unit_amount === slot.unitAmount &&
      price.recurring?.interval === slot.interval &&
      price.metadata?.aetherforge_catalog === PUBLIC_CATALOG &&
      price.metadata?.plan === slot.key
  );
  if (match) return match.id;

  const created = await stripe.prices.create({
    product,
    currency: "nzd",
    unit_amount: slot.unitAmount,
    recurring: { interval: slot.interval },
    nickname: `${slot.key} NZD ${PUBLIC_CATALOG}`,
    metadata: {
      plan: slot.key,
      ticker_limit: slot.tickerLimit,
      bot_access: slot.botAccess,
      aetherforge_catalog: PUBLIC_CATALOG,
    },
  });
  return created.id;
}
