#!/usr/bin/env ts-node
/**
 * Keep only the webhook endpoint pointing at the current NEXT_PUBLIC_APP_URL
 * (the custom domain) and delete any stale ones (e.g. old preview URLs) so
 * events don't double-fire to dead endpoints.
 */
import * as fs from "fs";
import * as path from "path";
import Stripe from "stripe";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const p = path.join(process.cwd(), ".env");
  fs.readFileSync(p, "utf-8").split("\n").forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const [k, ...r] = t.split("=");
    if (k && r.length) env[k.trim()] = r.join("=").trim();
  });
  return env;
}

async function main() {
  const env = loadEnv();
  const keep = `${env.NEXT_PUBLIC_APP_URL}/api/stripe/webhook`;
  const s = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-09-30.clover", typescript: true });
  const list = await s.webhookEndpoints.list({ limit: 100 });
  console.log("Live webhooks found:");
  for (const w of list.data) {
    const isKeep = w.url === keep;
    console.log(`  ${isKeep ? "KEEP  " : "DELETE"}  ${w.id}  ${w.url}`);
    if (!isKeep) await s.webhookEndpoints.del(w.id);
  }
  const after = await s.webhookEndpoints.list({ limit: 100 });
  console.log(`Remaining: ${after.data.length} -> ${after.data.map((w) => w.url).join(", ")}`);
}

main().catch((e) => { console.error(e?.raw || e); process.exit(1); });
