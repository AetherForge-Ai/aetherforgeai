/**
 * Reprovision Stripe webhook endpoints so BOTH the current preview host and the
 * production custom domain have a live endpoint whose signing secret we know.
 *
 * Why: Stripe only returns an endpoint's signing secret at CREATION time. The
 * app can receive events on either host, and each endpoint has a different
 * secret, so we must know both to verify signatures (see STRIPE_WEBHOOK_SECRETS
 * in src/lib/stripe.ts). This script creates fresh endpoints for both hosts,
 * writes both secrets to .env, then deletes the old endpoints.
 *
 * Safe on a live account: new endpoints are created (and secrets persisted)
 * BEFORE any old endpoint is deleted, and Stripe retries deliveries for hours.
 */
import fs from "fs";
import path from "path";
import Stripe from "stripe";

const ENV_PATH = path.join(process.cwd(), ".env");

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const ENABLED_EVENTS = [
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.completed",
  "checkout.session.expired",
];

// Production custom domain the live buttons/redirects use.
const PROD_URL = "https://www.aetherforgeai.co.nz";

function upsertEnvVar(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, `${key}=${value}`);
  // Insert after STRIPE_WEBHOOK_SECRET if present, else after STRIPE_SECRET_KEY, else append.
  const anchor = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(content)
    ? /^STRIPE_WEBHOOK_SECRET=.*$/m
    : /^STRIPE_SECRET_KEY=.*$/m;
  if (anchor.test(content)) return content.replace(anchor, (m) => `${m}\n${key}=${value}`);
  return content + `\n${key}=${value}\n`;
}

async function main() {
  const env = loadEnv();
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  const previewUrl = env.NEXT_PUBLIC_APP_URL;
  if (!previewUrl) throw new Error("NEXT_PUBLIC_APP_URL missing");

  const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true });
  const webhookPath = "/api/stripe/webhook";
  const targets = [
    { name: "production", url: `${PROD_URL}${webhookPath}` },
    { name: "preview", url: `${previewUrl}${webhookPath}` },
  ];

  // Record existing webhook endpoints (to delete after new ones are live).
  const before = await stripe.webhookEndpoints.list({ limit: 100 });
  const oldIds = before.data.map((w) => ({ id: w.id, url: w.url }));
  console.log("Existing endpoints:", oldIds.map((o) => `${o.id} ${o.url}`).join("\n  "));

  // Create fresh endpoints and capture secrets.
  const created = [];
  for (const t of targets) {
    const ep = await stripe.webhookEndpoints.create({
      url: t.url,
      enabled_events: ENABLED_EVENTS,
      description: `AetherForge ${t.name} webhook (reprovisioned)`,
    });
    if (!ep.secret) throw new Error(`No secret returned for ${t.name} endpoint`);
    created.push({ ...t, id: ep.id, secret: ep.secret });
    console.log(`Created ${t.name}: ${ep.id} -> ${t.url}`);
  }

  const prod = created.find((c) => c.name === "production");
  const preview = created.find((c) => c.name === "preview");

  // Persist both secrets to .env (production is primary).
  let content = fs.readFileSync(ENV_PATH, "utf-8");
  content = upsertEnvVar(content, "STRIPE_WEBHOOK_SECRET", prod.secret);
  content = upsertEnvVar(content, "STRIPE_WEBHOOK_SECRET_2", preview.secret);
  fs.writeFileSync(ENV_PATH, content, "utf-8");
  console.log("Wrote STRIPE_WEBHOOK_SECRET (prod) + STRIPE_WEBHOOK_SECRET_2 (preview) to .env");

  // Delete the OLD endpoints now that fresh ones + secrets are in place.
  for (const o of oldIds) {
    try {
      await stripe.webhookEndpoints.del(o.id);
      console.log(`Deleted old endpoint ${o.id} (${o.url})`);
    } catch (e) {
      console.warn(`Could not delete ${o.id}: ${e.message}`);
    }
  }

  const after = await stripe.webhookEndpoints.list({ limit: 100 });
  console.log(
    "\nFinal endpoints:\n  " +
      after.data.map((w) => `${w.status} ${w.url} (${w.id})`).join("\n  ")
  );
  console.log("\nDONE");
}

main().catch((e) => {
  console.error("REPROVISION FAILED:", e?.raw || e);
  process.exit(1);
});
