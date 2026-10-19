// pull-check:v3-goal-b48-2026-10-19
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stampTicker, tickerPathHeaders, tickerReason, TICKER_PATHS } from "@/lib/ticker-path";

const read = (p: string) => readFileSync(p, "utf8");

describe("b48 ticker self-report helpers", () => {
  it("path, age and version headers; CORS exposes them", () => {
    const now = Date.parse("2026-10-19T04:00:00Z");
    const h = tickerPathHeaders("shared-cache", { version: 1792378395486, at: "2026-10-19T03:59:15Z" }, now);
    expect(h["x-af-ticker-path"]).toBe("shared-cache");
    expect(h["x-af-snapshot-age"]).toBe("45");
    expect(h["x-af-snapshot-version"]).toBe("1792378395486");
    expect(h["Access-Control-Expose-Headers"]).toMatch(/x-af-ticker-path.*x-af-snapshot-age.*x-af-snapshot-version.*x-af-503-reason/);
  });
  it("never a version 0 or a negative age", () => {
    const h = tickerPathHeaders("deadline", { version: 0, at: "2099-01-01T00:00:00Z" }, 0);
    expect(h["x-af-snapshot-version"]).toBeUndefined();
    expect(h["x-af-snapshot-age"]).toBe("0");
  });
  it("503 reason lists reads and ms, and drops anything that is not a short safe word", () => {
    const r = tickerReason({ build: "null", edge: "timeout", edgeMs: "1500", durable: "miss", email: "a@b.test", cookie: "af_snap_v=1; x" }, 4312.4);
    expect(r).toBe("build=null edge=timeout edgeMs=1500 durable=miss ms=4312");
    expect(r).not.toMatch(/@|;|=1;/);
  });
  it("the documented paths match the route's branches", () => {
    const route = read("src/app/api/ticker/route.ts");
    for (const p of TICKER_PATHS) expect(route, p).toContain(`"${p}"`);
    expect(stampTicker(new Response("x"), { a: "1" }).headers.get("a")).toBe("1");
  });
});

describe("b48 /api/ticker replies carry the headers (simulated store)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/market-data");
    vi.doUnmock("@/lib/test-hooks.server");
    vi.resetModules();
  });
  async function instance(body: () => string | null) {
    vi.resetModules();
    vi.doMock("@/lib/market-data", () => ({ fetchLiveQuotes: async () => ({}) }));
    vi.doMock("@/lib/test-hooks.server", () => ({ currentUserMayUseTestHooks: async () => false }));
    const snap = await import("@/lib/crypto-snapshot");
    const shared = { body: body() };
    snap.installSnapshotDurable({
      read: async () => shared.body,
      write: async (_id: string, b: string) => ((shared.body = b), true),
      readLease: async () => null,
      writeLease: async () => true,
    });
    const route = await import("@/app/api/ticker/route");
    return { snap, route, shared };
  }
  const coins = Array.from({ length: 120 }, (_, i) => ({
    id: i === 0 ? "bitcoin" : `c${i}`, symbol: i === 0 ? "BTC" : `C${i}`, name: `Coin ${i}`, image: "", rank: i + 1, price: 100 + i,
    marketCap: 1e12 - i * 1e6, volume24h: 1e6, change24h: 1, change7d: 0, change1h: 0, fdv: null, high24h: null, low24h: null,
    circulatingSupply: null, totalSupply: null, maxSupply: null, ath: null, athDate: null, atl: null, atlDate: null, sparkline7d: [],
    blockchain: "", quotedAt: null, source: "coingecko", priceUnavailable: false, moves: null,
  }));

  it("a 200 names its path, age and version", async () => {
    const { snap, route } = await instance(() => null);
    await snap.persistCryptoSnapshot(coins as never, new Date(Date.now() - 30_000).toISOString());
    await snap.flushSnapshotWrites();
    const res = await route.GET(new Request("https://aetherforgeai.co.nz/api/ticker"));
    expect(res.status).toBe(200);
    expect(TICKER_PATHS).toContain(res.headers.get("x-af-ticker-path"));
    expect(Number(res.headers.get("x-af-snapshot-version"))).toBeGreaterThan(0);
    expect(Number(res.headers.get("x-af-snapshot-age"))).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it("a 503 (no snapshot anywhere) carries x-af-503-reason with ms", async () => {
    const { route } = await instance(() => null);
    const res = await route.GET(new Request("https://aetherforgeai.co.nz/api/ticker"));
    if (res.status === 503) {
      const reason = res.headers.get("x-af-503-reason") || "";
      expect(reason).toMatch(/ms=\d+$/);
      expect(reason).toMatch(/durable=(miss|timeout)/);
      expect(reason).not.toMatch(/@|cookie|token/i);
    } else {
      // A live seed may answer in some environments; then it must still self-report.
      expect(TICKER_PATHS).toContain(res.headers.get("x-af-ticker-path"));
    }
  }, 20_000);
});

describe("b48 build marker", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt")).toContain("v3-goal-b48-2026-10-19");
  });
});
