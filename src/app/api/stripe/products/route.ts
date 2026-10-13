/**
 * GET /api/stripe/products
 *
 * Returns AetherForge plan prices only. The allow-list is the plan config
 * (current and retired price ids). Other products on the same Stripe account
 * are never listed, and nothing is created or deleted in Stripe.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { aetherforgePriceIds } from "@/lib/plans";
import { stripe } from "@/lib/stripe";

function serializeError(err: unknown) {
  const e = err as { message?: string; code?: string; name?: string };
  return {
    message: e?.message ?? "Unknown error",
    code: e?.code ?? null,
    name: e?.name ?? null,
  };
}

type ListedPrice = {
  id: string;
  amount: number | null;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  nickname: string | null;
};

type ListedProduct = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  metadata: Stripe.Metadata;
  prices: ListedPrice[];
};

function isLiveProduct(product: Stripe.Price["product"] | null | undefined): product is Stripe.Product {
  if (!product || typeof product === "string") return false;
  return product.deleted !== true;
}

export async function GET() {
  try {
    const ids = aetherforgePriceIds();
    const retrieved = await Promise.all(
      ids.map(async (id) => {
        try {
          return await stripe.prices.retrieve(id, { expand: ["product"] });
        } catch (err) {
          console.warn("[api/stripe/products] price not returned", id, err instanceof Error ? err.message : "failed");
          return null;
        }
      })
    );

    const byProduct = new Map<string, ListedProduct>();
    for (const price of retrieved) {
      if (!price || !ids.includes(price.id)) continue;
      const product = price.product;
      if (!isLiveProduct(product)) continue;
      const row = byProduct.get(product.id) ?? {
        id: product.id,
        name: product.name,
        description: product.description,
        images: product.images,
        metadata: product.metadata,
        prices: [],
      };
      row.prices.push({
        id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval || null,
        intervalCount: price.recurring?.interval_count || null,
        nickname: price.nickname,
      });
      byProduct.set(product.id, row);
    }

    return NextResponse.json({
      ok: true,
      data: [...byProduct.values()],
    });
  } catch (err) {
    console.error("[API ERROR] /api/stripe/products", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
