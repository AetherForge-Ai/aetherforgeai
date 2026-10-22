// pull-check:v3-goal-b49-2026-10-19
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { noneHeaders, snapshotIsStale, SNAPSHOT_STALE_AFTER_MS, stampTicker, tickerPathHeaders, tickerReason, TICKER_PATHS } from "@/lib/ticker-path";
import { edgeSnapshotGet, type EdgeDiag } from "@/lib/ticker-serve";
import { CRYPTO_ROW_DROP_AFTER_MS, dropLaggingRows, mergeStaleCryptoList } from "@/lib/crypto-row-delay";
import { reevaluateRowDelay } from "@/lib/row-delay-label";

const read = (p: string) => readFileSync(p, "utf8");

describe("b49 H-1: edge read names its outcome (TT b48: edge=miss in 0 ms)", () => {
  const g = globalThis as unknown as { caches?: unknown };
  afterEach(() => {
    delete g.caches;
  });
  it("no Cache API binding", async () => {
    delete g.caches;
    const d: EdgeDiag = { outcome: "" };
    expect(await edgeSnapshotGet(100, d)).toBeNull();
    expect(d.outcome).toBe("nobinding");
  });
  it("a real miss, an exception and a bad body are told apart", async () => {
    const d: EdgeDiag = { outcome: "" };
    g.caches = { default: { match: async () => undefined, put: async () => undefined } };
    await edgeSnapshotGet(100, d);
    expect(d.outcome).toBe("miss");
    g.caches = { default: { match: async () => { throw new TypeError("boom secret"); }, put: async () => undefined } };
    await edgeSnapshotGet(100, d);
    expect(d.outcome).toBe("error-typeerror");
    g.caches = { default: { match: async () => new Response("{}"), put: async () => undefined } };
    await edgeSnapshotGet(100, d);
    expect(d.outcome).toBe("badbody");
    g.caches = { default: { match: async () => new Response(JSON.stringify({ version: 5 })), put: async () => undefined } };
    expect(await edgeSnapshotGet(100, d)).toEqual({ version: 5 });
    expect(d.outcome).toBe("hit");
  });
  it("the reason header accepts the classes and never a message", () => {
    const r = tickerReason({ edge: "error-typeerror", durable: "torn-version", durableRetry: "ok-retry", x: "has space" }, 12);
    expect(r).toBe("edge=error-typeerror durable=torn-version durableRetry=ok-retry ms=12");
  });
});

describe("b49 H-1: durable read classifies and retries once (simulated store)", () => {
  afterEach(() => {
    vi.resetModules();
  });
  it("a store error is named by class; a missing row is no-row", async () => {
    vi.resetModules();
    const snap = await import("@/lib/crypto-snapshot");
    snap.installSnapshotDurable({ read: async () => { throw new RangeError("db down token=abc"); }, write: async () => true });
    expect(await snap.readCryptoSnapshot(300)).toBeNull();
    expect(snap.cryptoReadOutcome()).toBe("error-rangeerror");
    vi.resetModules();
    const snap2 = await import("@/lib/crypto-snapshot");
    snap2.installSnapshotDurable({ read: async () => null, write: async () => true });
    expect(await snap2.readCryptoSnapshot(300)).toBeNull();
    expect(snap2.cryptoReadOutcome()).toBe("no-row");
  });
  it("errorClass never carries the message", async () => {
    const { errorClass } = await import("@/lib/crypto-snapshot");
    expect(errorClass(new Error("password=hunter2"))).toBe("error-error");
    expect(errorClass("x")).toBe("error-string");
  });
  it("the route retries the durable read once and names both outcomes; serves put the colo copy via waitUntil", () => {
    const route = read("src/app/api/ticker/route.ts");
    expect(route).toMatch(/trace\.durableRetry = /);
    expect(route).toMatch(/missClass\(cryptoReadOutcome\(\)\)/);
    expect(route).toMatch(/void keepAlive\(edgeSnapshotPut\(snap\)\)/);
    expect(route.match(/rememberServed\(/g)!.length).toBeGreaterThanOrEqual(4); // def + fallback + late + build
    const store = read("src/lib/crypto-snapshot.ts");
    expect(store).toMatch(/TORN_READ_RETRY_MS/);
    expect(store).toMatch(/torn-version/);
  });
});

describe("b49: 503 self-report and one stale rule", () => {
  it("503 carries path none and an age", () => {
    const now = 1_800_000_000_000;
    expect(noneHeaders(0, now)).toMatchObject({ "x-af-ticker-path": "none", "x-af-snapshot-age": "unknown" });
    expect(noneHeaders(now - 9_000, now)["x-af-snapshot-age"]).toBe("9");
    expect(TICKER_PATHS).toContain("none");
  });
  it("stale is one rule from age, and a fresh snapshot removes an older stale flag", () => {
    const now = Date.parse("2026-10-19T06:00:00Z");
    const fresh = new Date(now - 60_000).toISOString();
    const old = new Date(now - SNAPSHOT_STALE_AFTER_MS - 1000).toISOString();
    expect(snapshotIsStale(fresh, now)).toBe(false);
    expect(snapshotIsStale(old, now)).toBe(true);
    const res = new Response("{}", { headers: { "x-af-snapshot-stale": "1" } });
    stampTicker(res, tickerPathHeaders("deadline", { version: 1, at: fresh }, now));
    expect(res.headers.get("x-af-snapshot-stale")).toBeNull();
    stampTicker(res, tickerPathHeaders("deadline", { version: 1, at: old }, now));
    expect(res.headers.get("x-af-snapshot-stale")).toBe("1");
  });
  it("no branch hard-codes the stale flag any more", () => {
    const route = read("src/app/api/ticker/route.ts");
    expect(route).not.toMatch(/"x-af-snapshot-stale": "1", "Set-Cookie"/);
    expect(route).toMatch(/snapshotIsStale\(snap\.at\) \|\| !feed\.rows\.crypto\.length/);
  });
});

describe("b49: a crypto row hours behind the list is dropped (TT b48: one row 16 h old)", () => {
  const now = Date.parse("2026-10-19T06:00:00Z");
  const iso = (ago: number) => new Date(now - ago).toISOString();
  const coin = (id: string, quotedAt: string) => ({ id, symbol: id.toUpperCase(), price: 1, change24h: 0, quotedAt }) as never;
  it("dropLaggingRows keeps the list and drops the laggard", () => {
    const rows = [{ quotedAt: iso(60_000) }, { quotedAt: iso(30 * 3600_000) }, { quotedAt: null }];
    expect(dropLaggingRows(rows)).toHaveLength(2);
    // A whole list that is old together is kept (nothing lags the newest row).
    expect(dropLaggingRows([{ quotedAt: iso(40 * 3600_000) }, { quotedAt: iso(40 * 3600_000 + 1) }])).toHaveLength(2);
  });
  it("a partial merge drops unmatched rows older than the drop age", () => {
    const merged = mergeStaleCryptoList(
      { at: iso(20 * 60_000), coins: [coin("btc", iso(20 * 60_000)), coin("old", iso(CRYPTO_ROW_DROP_AFTER_MS + 3600_000))] },
      [coin("btc", iso(0))],
      iso(0)
    );
    expect(merged!.map((c: { id: string }) => c.id)).toEqual(["btc"]);
  });
  it("the /markets index drops it and recounts", () => {
    const idx = reevaluateRowDelay(
      { tabs: [{ id: "CRYPTO", rows: [{ asOf: "a", quotedAt: iso(60_000) }, { asOf: "b", quotedAt: iso(30 * 3600_000) }] }], priceRowCount: 2 },
      now
    );
    expect(idx.tabs[0].rows).toHaveLength(1);
    expect(idx.priceRowCount).toBe(1);
  });
});

describe("b49 M-2: /status crypto Last OK falls back to the snapshot time", () => {
  it("does one longer stored read before giving up", () => {
    expect(read("src/lib/status-feeds.server.ts")).toMatch(/within\(readCryptoSnapshot\(2_000\), 2_200\)/);
  });
});

describe("b49 build marker", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt")).toContain("v3-goal-b58-2026-10-22");
  });
});
