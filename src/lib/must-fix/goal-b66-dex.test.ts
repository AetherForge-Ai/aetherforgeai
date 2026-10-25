// pull-check:v3-h1-b67-2026-10-26
/** b66 TT P3: the per-source DEX report rides on the saved DEX snapshot (shared by every server). */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DexTokenRow } from "@/lib/crypto-dex";
import {
  clearSnapshotMemory,
  installSnapshotDurable,
  persistDexReport,
  persistDexSnapshot,
  readDexSnapshot,
  resetCryptoSnapshotsForTests,
  type SnapshotDurable,
  type SnapshotId,
} from "@/lib/crypto-snapshot";

function memoryDurable(): SnapshotDurable {
  const store = new Map<SnapshotId, string>();
  return { read: async (id) => store.get(id) ?? null, write: async (id, body) => (store.set(id, body), true) };
}
const row = (symbol: string): DexTokenRow => ({
  id: symbol.toLowerCase(), symbol, name: symbol, price: 2, priceUnavailable: false, volume24h: 1000,
  network: "Ethereum", dex: "Uniswap", detailId: symbol.toLowerCase(), address: `eth_${symbol.toLowerCase()}`, reserveUsd: 50_000,
});

afterEach(() => resetCryptoSnapshotsForTests());

describe("b66 DEX report on the snapshot", () => {
  it("a successful refresh saves each source's result with the rows", async () => {
    installSnapshotDurable(memoryDurable());
    const at = new Date().toISOString();
    await persistDexSnapshot([row("PEPE")], at, ["dexpaprika"], [
      { source: "geckoterminal", status: 200, rows: 0, reason: "empty list on 5 of 5 pages" },
      { source: "dexpaprika", status: 200, rows: 180, reason: null },
    ]);
    clearSnapshotMemory();
    const snap = await readDexSnapshot(50);
    expect(snap?.report?.map((r) => `${r.source}:${r.rows}`)).toEqual(["geckoterminal:0", "dexpaprika:180"]);
    expect(snap?.reportAt).toBe(at);
  });

  it("a failed refresh keeps rows and time but saves the new report", async () => {
    installSnapshotDurable(memoryDurable());
    const at = "2026-10-24T04:00:00.000Z";
    await persistDexSnapshot([row("PEPE")], at, ["dexpaprika"]);
    const later = "2026-10-24T05:00:00.000Z";
    expect(await persistDexReport([{ source: "dexpaprika", status: 429, rows: 0, reason: "HTTP 429; rate limited" }], later)).toBe(true);
    clearSnapshotMemory();
    const snap = await readDexSnapshot(50);
    expect(snap?.at).toBe(at);
    expect(snap?.rows.map((r) => r.symbol)).toEqual(["PEPE"]);
    expect(snap?.report?.[0]).toMatchObject({ source: "dexpaprika", status: 429, rows: 0, reason: "HTTP 429; rate limited" });
    expect(snap?.reportAt).toBe(later);
  });

  it("no snapshot yet: nothing to attach to", async () => {
    installSnapshotDurable(memoryDurable());
    expect(await persistDexReport([{ source: "dexpaprika", status: null, rows: 0, reason: "timed out" }])).toBe(false);
  });
});
