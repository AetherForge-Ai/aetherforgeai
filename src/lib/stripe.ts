/**
 * Stripe Configuration and Utilities
 *
 * This file initializes the Stripe client and provides demo products/prices
 * that will be automatically created in Stripe when the API key is provided.
 */

import Stripe from "stripe";
import { StripeProduct } from "@/types/stripe";

// Get Stripe secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

// Lazy initialization to avoid build-time errors when API key is not set
let stripeInstance: Stripe | null = null;

/**
 * Get Stripe client instance
 * Initializes Stripe client on first use
 */
export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!stripeSecretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set in environment variables. " +
        "Add your Stripe secret key to .env to enable Stripe integration."
      );
    }
    stripeInstance = new Stripe(stripeSecretKey, {
      apiVersion: "2025-09-30.clover",
      typescript: true,
      // Use Fetch HTTP client for Cloudflare Workers compatibility
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return stripeInstance;
}

// For backward compatibility and convenience
export const stripe = new Proxy({} as Stripe, {
  get(target, prop) {
    return (getStripe() as any)[prop];
  }
});

/**
 * SubtleCryptoProvider for webhook signature verification
 * Required for Cloudflare Workers since WebCrypto is async
 */
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

/**
 * Available Products Configuration
 *
 * Define your products here. These will be created in Stripe automatically
 * when accessed. This allows you to manage products in code and deploy changes
 * easily without database migrations.
 */
export const PRODUCTS_AVAILABLE: StripeProduct[] = [
  {
    name: "AetherForge Pro",
    description:
      "Full access to AetherForge AI: unlimited holdings, live portfolio analytics, AI research reports, and the AI market assistant.",
    type: "subscription",
    prices: [
      {
        amount: 1900, // $19.00/month
        currency: "usd",
        interval: "month",
        nickname: "Monthly",
      },
      {
        amount: 18000, // $180.00/year (2 months free)
        currency: "usd",
        interval: "year",
        nickname: "Yearly (Save 21%)",
      },
    ],
  },
];

/**
 * Helper function to format amount in cents to dollars
 */
export function formatAmount(amount: number, currency: string = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/**
 * Helper function to create products in Stripe
 * Creates all products defined in PRODUCTS_AVAILABLE
 */
export async function createProductsInStripe() {
  const createdProducts: Array<{
    product: Stripe.Product;
    prices: Stripe.Price[];
  }> = [];

  for (const product of PRODUCTS_AVAILABLE) {
    try {
      // Create product in Stripe
      const stripeProduct = await stripe.products.create({
        name: product.name,
        description: product.description,
        metadata: {
          type: product.type,
        },
      });

      const prices: Stripe.Price[] = [];

      // Create prices for this product
      for (const price of product.prices) {
        const priceData: Stripe.PriceCreateParams = {
          product: stripeProduct.id,
          unit_amount: price.amount,
          currency: price.currency,
          nickname: price.nickname,
        };

        // Add recurring data for subscription prices
        if (price.interval) {
          priceData.recurring = {
            interval: price.interval,
          };
        }

        const createdPrice = await stripe.prices.create(priceData);
        prices.push(createdPrice);
      }

      createdProducts.push({ product: stripeProduct, prices });
    } catch (error) {
      console.error(`Error creating product ${product.name}:`, error);
      throw error;
    }
  }

  return createdProducts;
}

/**
 * Get Stripe webhook signing secret (primary).
 */
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/**
 * All configured webhook signing secrets.
 *
 * The app can be reached on more than one live host — e.g. the Totalum preview
 * subdomain AND the custom production domain (https://www.aetherforgeai.co.nz).
 * Each host has its own Stripe webhook endpoint, and every endpoint has a
 * DIFFERENT signing secret. With a single secret, deliveries from the "other"
 * endpoint would fail signature verification and silently drop subscription
 * activations. To be robust we verify against every known secret and accept the
 * event if ANY of them validates the signature.
 *
 * Secrets are collected from STRIPE_WEBHOOK_SECRET (which may itself be a
 * comma/space separated list) plus STRIPE_WEBHOOK_SECRET_2..3, de-duplicated.
 */
export const STRIPE_WEBHOOK_SECRETS: string[] = Array.from(
  new Set(
    [
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_WEBHOOK_SECRET_2,
      process.env.STRIPE_WEBHOOK_SECRET_3,
    ]
      .flatMap((v) => (v ? v.split(/[,\s]+/) : []))
      .map((s) => s.trim())
      .filter(Boolean)
  )
);

if (!STRIPE_WEBHOOK_SECRETS.length && stripeSecretKey) {
  console.warn(
    "⚠️  STRIPE_WEBHOOK_SECRET is not set. " +
    "Webhook signature verification will be skipped. " +
    "Add STRIPE_WEBHOOK_SECRET to .env for production."
  );
}

/**
 * Get the public-facing app URL
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Resolve the base URL to use for Stripe redirect URLs from the incoming request.
 *
 * This keeps the user on whichever host they are actually browsing — the default
 * *.totalum-project.com subdomain OR a custom domain like https://www.aetherforgeai.co.nz —
 * so Stripe Checkout success/cancel redirects never bounce them to a different origin.
 *
 * Falls back to the configured APP_URL when host headers are unavailable.
 */
export function getRequestBaseUrl(req: Request): string {
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (host) {
      const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
    // Some environments only expose the full URL on the request.
    const origin = new URL(req.url).origin;
    if (origin && !origin.startsWith("null")) return origin;
  } catch (err) {
    console.error("[stripe] getRequestBaseUrl failed, falling back to APP_URL:", err);
  }
  return APP_URL;
}
