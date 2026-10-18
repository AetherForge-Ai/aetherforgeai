/**
 * GET /api/crypto/markets
 * Top 400 by market cap. CoinGecko first. Swyftx fills only when SWYFTX_PUBLIC_DISPLAY is on. Yahoo majors are last.
 * Always JSON. A failed source is a plain sentence, never an HTTP 502
 * (Cloudflare replaces that body with text).
 */
import { NextResponse } from "next/server";
import { marketsBody } from "@/lib/crypto-api-body";
import { loadTop400Markets } from "@/lib/crypto-source";
import { readCryptoSnapshot } from "@/lib/crypto-snapshot";
import { snapshotFloorCookie, snapshotFloorFrom } from "@/lib/snapshot-floor";

export const dynamic = "force-dynamic";

/** b31 REG-1/H-1: short private TTL; the CDN never serves an older snapshot version. */
const CACHE_CONTROL = "private, max-age=5";

export async function GET(req: Request) {
  // b35 H-1 (GOAL-LOCK #25): honour the client's version floor before building the page, so this
  // isolate's copy is at least as new as any list this client was already served.
  const floor = snapshotFloorFrom(req);
  const snap = await readCryptoSnapshot(undefined, { floor }).catch(() => null);
  try {
    const page = await loadTop400Markets();
    if (page.coins?.length) {
      return NextResponse.json(marketsBody(page.coins, page.notice, page.at), {
        // b29 H-1: snapshot version, so a test can compare reads and catch time running backwards.
        headers: {
          "cache-control": CACHE_CONTROL,
          "CDN-Cache-Control": "no-store",
          "x-af-snapshot-at": page.at || "",
          "x-af-snapshot-version": String(page.version ?? 0),
          "Set-Cookie": snapshotFloorCookie(Math.max(page.version ?? 0, floor)),
        },
      });
    }
  } catch (err: unknown) {
    console.error("[api/crypto/markets] error:", err);
  }
  // Never a 200 with an empty list while a copy exists: serve it marked stale; 503 only with none.
  if (snap?.coins.length) {
    return NextResponse.json(
      { ...marketsBody(snap.coins, "Showing the last saved list while the refresh catches up.", snap.at), stale: true },
      { headers: { "cache-control": "no-store", "x-af-snapshot-at": snap.at, "x-af-snapshot-version": String(snap.version), "x-af-snapshot-stale": "1" } }
    );
  }
  return NextResponse.json(
    { ok: false, error: "Crypto prices are not available yet. Retrying shortly." },
    { status: 503, headers: { "cache-control": "no-store", "Retry-After": "5" } }
  );
}
