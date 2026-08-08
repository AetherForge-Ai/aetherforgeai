#!/usr/bin/env ts-node
/**
 * Keep only the STABLE production webhook endpoint (the apex custom domain) and
 * delete any stale ones — e.g. old ephemeral preview URLs
 * (temporal-link-preview-*.totalum-project.com) that change on every deploy and
 * leave dead endpoints behind, which makes Stripe email "webhook is failing".
 *
 * IMPORTANT: we keep the apex host (no "www.") because www.aetherforgeai.co.nz
 * 301-redirects to the apex and Stripe does not follow redirects.
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

// Stable apex production host — never the ephemeral preview URL.
const PROD_URL = "https://aetherforgeai.co.nz";

async function main() {
  const env = loadEnv();
  const keep = `${PROD_URL}/api/stripe/webhook`;
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
