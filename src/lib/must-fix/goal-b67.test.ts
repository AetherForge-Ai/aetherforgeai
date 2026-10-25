// pull-check:v3-h1-b67-2026-10-26
/** b67 H-1 (Business Planner, 26 Oct 2026): one price source, Close labels, GeckoTerminal backoff, partial DEX pull, DEX print time, POL. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import type { DexTokenRow } from "@/lib/crypto-dex";
import { closeLabelFor, dexPrintedLabel, tapeUpdatedPhrase } from "@/lib/market-freshness";
import { keepFullDexOnPartial } from "@/lib/crypto-board";
import { dexBody } from "@/lib/crypto-api-body";
import { GT_BACKOFF_MS, gtBackoffMs } from "@/lib/crypto-keyless-seed";
import { installSnapshotDurable, persistDexSnapshot, readDexSnapshot, resetCryptoSnapshotsForTests, clearSnapshotMemory, type SnapshotDurable, type SnapshotId } from "@/lib/crypto-snapshot";

const read = (p: string) => readFileSync(p, "utf8");
const row = (symbol: string, price = 2): DexTokenRow => ({
  id: symbol.toLowerCase(), symbol, name: symbol, price, priceUnavailable: false, volume24h: 1000,
  network: "Ethereum", dex: "Uniswap", detailId: symbol.toLowerCase(), address: `eth_${symbol.toLowerCase()}`, reserveUsd: 50_000,
});
function memoryDurable(): SnapshotDurable {
  const store = new Map<SnapshotId, string>();
  return { read: async (id) => store.get(id) ?? null, write: async (id, body) => (store.set(id, body), true) };
}
afterEach(() => resetCryptoSnapshotsForTests());

// Sat 24 Oct 2026 11:00 NZDT
const SATURDAY = new Date("2026-10-23T22:00:00.000Z");

describe("H-1 weekend labels read Close <Fri date>", () => {
  it("NZX and ASX on Saturday show Friday 23 Oct 2026 even when the quote was fetched Saturday", () => {
    expect(closeLabelFor("NZX", "2026-10-23T21:55:00.000Z", SATURDAY)).toBe("Close 23 Oct 2026");
    expect(closeLabelFor("ASX", SATURDAY, SATURDAY)).toBe("Close 23 Oct 2026");
    expect(tapeUpdatedPhrase("2026-10-23T21:55:00.000Z", "NZX", SATURDAY)).toBe("Close 23 Oct 2026");
  });
  it("an older quote keeps its own (older) date", () => {
    expect(closeLabelFor("NZX", "2026-10-21T04:00:00.000Z", SATURDAY)).toBe("Close 21 Oct 2026");
  });
  it("the watchlist quote route uses the same label", () => {
    const src = read("src/app/api/tickers/quote/route.ts");
    expect(src).toContain("closeLabelFor(equityVenue(exchange), quotedAt");
    expect(src).not.toContain("`Last close ${");
  });
});

describe("H-1 one price source", () => {
  it("watchlist crypto quote reads the shared snapshot first (same as /markets, drawer and ticker)", () => {
    const src = read("src/app/api/tickers/quote/route.ts");
    expect(src.indexOf("priceFromSnapshot")).toBeGreaterThan(0);
    expect(src.indexOf("priceFromSnapshot")).toBeLessThan(src.indexOf("readCoinList()"));
  });
});

describe("H-1 GeckoTerminal 429 backoff", () => {
  it("backs off at least 60 s, honours Retry-After, caps at 10 min", () => {
    expect(gtBackoffMs(null)).toBe(GT_BACKOFF_MS);
    expect(gtBackoffMs("120")).toBe(120_000);
    expect(gtBackoffMs("5")).toBe(GT_BACKOFF_MS);
    expect(gtBackoffMs("99999")).toBe(600_000);
    const now = Date.parse("2026-10-26T00:00:00Z");
    expect(gtBackoffMs("Mon, 26 Oct 2026 00:03:00 GMT", now)).toBe(180_000);
  });
  it("pages run two at a time and serve the last good copy on a 429", () => {
    const src = read("src/lib/crypto-keyless-seed.ts");
    expect(src).toContain("GT_CONCURRENCY = 2");
    expect(src).toContain("gtCachedPage(url)");
  });
});

describe("H-1 partial DEX pull keeps the last full list", () => {
  const full = Array.from({ length: 40 }, (_, i) => row(`T${i}`));
  it("fresh prices win, unreached rows stay", () => {
    const merged = keepFullDexOnPartial(full, [row("T1", 9), row("NEW", 3)]);
    expect(merged.length).toBe(41);
    expect(merged.find((r) => r.symbol === "T1")?.price).toBe(9);
    expect(merged.filter((r) => r.symbol === "T1").length).toBe(1);
  });
  it("persistDexSnapshot never shrinks the saved list on a partial pull", async () => {
    installSnapshotDurable(memoryDurable());
    await persistDexSnapshot(full, new Date(Date.now() - 60_000).toISOString(), ["geckoterminal"]);
    await persistDexSnapshot([row("T2", 7)], new Date().toISOString(), ["geckoterminal"]);
    clearSnapshotMemory();
    const snap = await readDexSnapshot(50);
    expect(snap?.rows.length).toBe(40);
    expect(snap?.rows.find((r) => r.symbol === "T2")?.price).toBe(7);
  });
});

describe("H-1 DEX print time on the DEX tab", () => {
  it("API body carries printedAt and the tab shows it", () => {
    const body = dexBody([row("A")], { notice: null, printedAt: "2026-10-25T20:05:00.000Z" });
    expect(body.ok && body.printedAt).toBe("2026-10-25T20:05:00.000Z");
    expect(dexPrintedLabel("2026-10-25T20:05:00.000Z")).toMatch(/^DEX prices printed 26 Oct 2026, 9:05/);
    expect(dexPrintedLabel(null)).toBeNull();
    expect(read("src/components/dashboard/MarketsExplorer.tsx")).toContain('data-testid="dex-printed-at"');
  });
});

describe("H-1 MATIC renamed POL", () => {
  it("ticker shows POL; MATIC is kept only as a stale alias", () => {
    expect(read("src/lib/ticker-feed.ts")).toContain('symbol: "POL"');
    expect(read("src/lib/ticker-feed.ts")).not.toContain('symbol: "MATIC"');
    expect(read("src/lib/crypto-directory.ts")).toMatch(/MATIC.*stale/);
  });
});
