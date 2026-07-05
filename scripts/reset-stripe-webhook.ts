#!/usr/bin/env ts-node
/**
 * Delete any existing webhook endpoint(s) pointing at this app's /api/stripe/webhook
 * URL so `npm run setup:stripe-webhook` can recreate one and capture its signing
 * secret (Stripe only returns the secret at creation time).
 */
import * as fs from "fs";
import * as path from "path";
import Stripe from "stripe";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) return env;
  fs.readFileSync(p, "utf-8").split("\n").forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const [k, ...rest] = t.split("=");
    if (k && rest.length) env[k.trim()] = rest.join("=").trim();
  });
  return env;
}

async function main() {
  const env = loadEnv();
  const key = env.STRIPE_SECRET_KEY;
  const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/stripe/webhook`;
  if (!key) { console.error("STRIPE_SECRET_KEY missing"); process.exit(1); }

  const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true });
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const matches = list.data.filter((w) => w.url === webhookUrl);
  if (!matches.length) { console.log("No existing webhook to delete."); return; }
  for (const w of matches) {
    await stripe.webhookEndpoints.del(w.id);
    console.log(`Deleted stale webhook ${w.id} (${w.url})`);
  }
}

main().catch((e) => { console.error(e?.raw || e); process.exit(1); });
