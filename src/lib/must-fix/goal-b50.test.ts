// pull-check:v3-goal-b50-2026-10-19
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runtimeErrorClass } from "@/lib/ticker-serve";

const read = (p: string) => readFileSync(p, "utf8");

/**
 * b50 P1 (TT b49: NZX/ASX missing in 13/253 200s; same snapshot version with and without equities;
 * paths snapshot-hit, store-read, deadline). Root cause reproduced here: a Worker request has a fixed
 * subrequest budget, and once it is spent every further fetch or Cache API call throws at once
 * ("Too many subrequests" — the edge=error-error edgeMs=0 TT saw). b49 added store-read retries and a
 * colo put on every serve, and the NZX/ASX fetch ran AFTER the snapshot reads, so in a cold isolate
 * it was the call that hit the limit: no live quotes, no colo copy readable, rows.nzx=[] asx=[].
 */
const NZX = ["AIR.NZ", "FPH.NZ", "MEL.NZ"];
const ASX = ["TLX.AX", "BHP.AX", "CBA.AX"];
const TAPE = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "TRX", "AVAX", "LINK", "DOT", "LTC"];
const coins = Array.from({ length: 400 }, (_, i) => ({
  id: i < TAPE.length ? TAPE[i].toLowerCase() : `c${i}`, symbol: i < TAPE.length ? TAPE[i] : `C${i}`, name: `Coin ${i}`, image: "", rank: i + 1, price: 100 + i,
  marketCap: 1e12 - i * 1e6, volume24h: 1e6, change24h: 1, change7d: 0, change1h: 0, fdv: null, high24h: null, low24h: null,
  circulatingSupply: null, totalSupply: null, maxSupply: null, ath: null, athDate: null, atl: null, atlDate: null, sparkline7d: [],
  blockchain: "", quotedAt: null, source: "coingecko", priceUnavailable: false, moves: null,
}));
// Overnight NZX/ASX quotes are hours old — they must never be dropped by a crypto age rule.
const quoteAt = new Date(Date.now() - 9 * 3600_000).toISOString();
const equityQuotes = Object.fromEntries([...NZX, ...ASX].map((s) => [s, { price: 10, changePct: 0.5, quotedAt: quoteAt, source: "yahoo" }]));

/** Per-request subrequest budget: every store read and the equity fetch spend one; over it, they throw. */
const budget = { left: Infinity, equityFails: false };
const spend = () => {
  if (budget.left <= 0) throw new Error("Too many subrequests.");
  budget.left -= 1;
};

async function isolate(store: { body: string | null; lease: string | null }, opts: { slowStore?: boolean } = {}) {
  vi.resetModules();
  vi.doMock("@/lib/market-data", () => ({
    fetchLiveQuotes: async () => {
      spend();
      if (budget.equityFails) throw new Error("upstream 500");
      return equityQuotes;
    },
  }));
  vi.doMock("@/lib/test-hooks.server", () => ({ currentUserMayUseTestHooks: async () => false }));
  const snap = await import("@/lib/crypto-snapshot");
  snap.installSnapshotDurable({
    read: async () => {
      spend();
      if (opts.slowStore) await new Promise((r) => setTimeout(r, 30));
      return store.body;
    },
    write: async (_id: string, b: string) => ((store.body = b), true),
    readLease: async () => store.lease,
    writeLease: async (b: string) => ((store.lease = b), true),
  });
  const route = await import("@/app/api/ticker/route");
  return { snap, route };
}
type Body = { data: { rows: { nzx: unknown[]; asx: unknown[]; crypto: unknown[] }; providers: { equities: string | null } } };
async function call(route: { GET: (r: Request) => Promise<Response> }, left = Infinity) {
  budget.left = left;
  const res = await route.GET(new Request("https://aetherforgeai.co.nz/api/ticker"));
  budget.left = Infinity;
  const body = res.status === 200 ? ((await res.json()) as Body) : null;
  return { res, body, path: res.headers.get("x-af-ticker-path") };
}

describe("b50 P1: NZX/ASX rows survive a spent subrequest budget (reproduces TT b49)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/market-data");
    vi.doUnmock("@/lib/test-hooks.server");
    vi.resetModules();
    budget.left = Infinity;
    budget.equityFails = false;
  });
  const shared = { body: null as string | null, lease: null as string | null };

  it("a cold isolate with a tight budget still fetches the equities first", async () => {
    const seed = await isolate(shared);
    await seed.snap.persistCryptoSnapshot(coins as never, new Date(Date.now() - 30_000).toISOString());
    await seed.snap.flushSnapshotWrites();
    // Cold isolate, budget of 2: the equity fetch must be among the first calls (b49 spent it on reads).
    const cold = await isolate(shared);
    const r = await call(cold.route, 2);
    expect(r.res.status).toBe(200);
    expect(r.body!.data.rows.crypto.length).toBeGreaterThan(0);
    expect(r.body!.data.rows.nzx.length).toBe(NZX.length);
    expect(r.body!.data.rows.asx.length).toBe(ASX.length);
    expect(r.body!.data.providers.equities).toBeTruthy();
  }, 20_000);

  it("once seen, every serve path returns the equities (snapshot-hit, store-read, deadline, last-good)", async () => {
    const inst = await isolate(shared);
    await inst.snap.persistCryptoSnapshot(coins as never, new Date(Date.now() - 30_000).toISOString());
    await inst.snap.flushSnapshotWrites();
    const first = await call(inst.route);
    expect(first.body!.data.rows.nzx.length).toBe(NZX.length);
    // From now on the live fetch fails (or the budget is gone) on every request.
    budget.equityFails = true;
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const r = await call(inst.route, i % 2 ? 0 : 3);
      if (r.res.status !== 200) continue;
      seen.add(String(r.path));
      expect(r.body!.data.rows.nzx.length, `path ${r.path}`).toBe(NZX.length);
      expect(r.body!.data.rows.asx.length, `path ${r.path}`).toBe(ASX.length);
      expect(r.body!.data.providers.equities, `path ${r.path}`).toBeTruthy();
    }
    expect(seen.size).toBeGreaterThan(0);
  }, 30_000);

  it("source: equity fetch first, rows never dropped by age, colo/body copies never written without equities", () => {
    const route = read("src/app/api/ticker/route.ts");
    expect(route.indexOf("const equityP = startEquityFetch();")).toBeLessThan(route.indexOf("const fallbackReply = fallbackSnapshot(trace)"));
    expect(route).toMatch(/snapshotOnlyResponse\(floored\.snap, floor, equityP\)/);
    expect(route).toMatch(/snapshotOnlyResponse\(lateSnap, floor, equityP\)/);
    expect(route).toMatch(/withEquities\(withStaleFromAge\(lastGoodResponse\.body/);
    expect(route).toMatch(/withEquities\(withStaleFromAge\(edgeBody\.body/);
    expect(route).toMatch(/snap\.version > prevVersion && bodyHasEquities\(body\)/);
    expect(read("src/lib/row-delay-label.ts")).toMatch(/tab\.id === "CRYPTO" \? dropLaggingRows/);
    expect(read("src/lib/ticker-feed.ts")).not.toMatch(/dropLaggingRows|snapshotIsStale/);
  });
});

describe("b50 P2: edge error class names the runtime failure (TT b49: edge=error-error edgeMs=0)", () => {
  it("maps known Workers messages to fixed words, never the message", () => {
    expect(runtimeErrorClass(new Error("Too many subrequests."))).toBe("error-subreq");
    expect(runtimeErrorClass(new Error("Cannot perform I/O on behalf of a different request."))).toBe("error-xreq");
    expect(runtimeErrorClass(new TypeError("Invalid URL: x"))).toBe("error-url");
    expect(runtimeErrorClass(new Error("password=hunter2"))).toBe("error-error");
  });
  it("store errors are not retried; the first durable attempt is shorter; a spent budget skips the late read", () => {
    const route = read("src/app/api/ticker/route.ts");
    expect(route).toMatch(/const FIRST_DURABLE_MS = 1_200;/);
    expect(route).toMatch(/trace\.durable === "timeout" \|\| trace\.durable\.startsWith\("torn-"\)/);
    expect(route).toMatch(/trace\.lateDurable = "skipped"/);
    expect(read("src/lib/crypto-snapshot.ts")).toMatch(/if \(!res\.raw && res\.outcome\.startsWith\("torn-"\)\)/);
  });
});

describe("b50 P3: h4-playwright skips visibly without secrets", () => {
  it("a preflight job gates the h4 job (skipped status on a schedule)", () => {
    const wf = read(".github/workflows/h4-playwright.yml");
    expect(wf).toMatch(/needs: secrets-check/);
    expect(wf).toMatch(/if: \$\{\{ needs\.secrets-check\.outputs\.ok == 'true' \}\}/);
    expect(wf).not.toMatch(/SKIP=1/);
  });
});

describe("b50 build marker", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt")).toContain("v3-b87-2026-10-28");
  });
});
