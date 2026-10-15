import { NextResponse } from "next/server";
import { ULTIMATE_FEATURES } from "@/lib/feature-flags";
import { rateLimitStep, verifyApiKey, visiblePortfolios } from "@/lib/ultimate/core";
import { loadUltimateStore } from "@/lib/ultimate/store";

export const dynamic = "force-dynamic";

const windows = new Map<string, { start: number; count: number }>();

/** GET /api/v1/portfolios — read-only list for an Ultimate API key. Off unless ULTIMATE_FEATURES=1. */
export async function GET(req: Request) {
  if (!ULTIMATE_FEATURES) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const auth = req.headers.get("authorization") || "";
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const store = await loadUltimateStore();
  const userId = verifyApiKey(presented, store.keys);
  if (!userId) return NextResponse.json({ ok: false, error: "Invalid or revoked API key" }, { status: 401 });
  const step = rateLimitStep(windows, userId);
  if (!step.ok) {
    return NextResponse.json({ ok: false, error: "Rate limit" }, { status: 429, headers: { "Retry-After": String(step.retryAfterSec) } });
  }
  const list = visiblePortfolios(userId, store.portfolios, store.seats).map((p) => ({ id: p.id, name: p.name }));
  return NextResponse.json({ ok: true, data: list }, { headers: { "Cache-Control": "private, no-store" } });
}

export function POST() {
  return NextResponse.json({ ok: false, error: "This API is read-only." }, { status: 405 });
}
