// pull-check:v3-goal-b35-2026-10-19
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

/**
 * b35 H-1 (GOAL-LOCK #25): TT's repro.py logic (repro-crypto-empty/, 19 Oct 07:18 NZDT: 3/60 empty
 * crypto, 2/60 missing headers, 6/60 version step-backs) run locally against a simulated
 * multi-instance refresh burst. Each "instance" is a fresh module registry (its own memory) over
 * one shared store with latency; refreshes race; some instances start cold mid-run.
 */

// Seeded LCG so the simulation is reproducible (no Math.random).
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const TAPE = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "TRX", "AVAX", "LINK", "DOT", "LTC"];
function coins(n: number, bump: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i < TAPE.length ? TAPE[i].toLowerCase() : `c${i}`, symbol: i < TAPE.length ? TAPE[i] : `C${i}`, name: `Coin ${i}`, image: "",
    rank: i + 1, price: 100 + i + bump, marketCap: 1e12 - i * 1e6, volume24h: 1e6, change24h: 1, change7d: 0, change1h: 0, fdv: null,
    high24h: null, low24h: null, circulatingSupply: null, totalSupply: null, maxSupply: null, ath: null, athDate: null, atl: null,
    atlDate: null, sparkline7d: [], blockchain: "", quotedAt: null, source: "coingecko", priceUnavailable: false, moves: null,
  }));
}

interface Load { i: number; status: number; version: string; at: string; crypto: number; btc: boolean; eth: boolean; sol: boolean }

async function runBurst(opts: { seed: number; keepCookie: boolean; loads: number }) {
  const rnd = lcg(opts.seed);
  const delay = (lo: number, hi: number) => new Promise((r) => setTimeout(r, lo + Math.floor(rnd() * (hi - lo))));
  const shared = { body: null as string | null, lease: null as string | null };
  const store = {
    read: async () => { await delay(5, 60); return shared.body; },
    write: async (_id: string, body: string) => { await delay(20, 120); shared.body = body; return true; },
    readLease: async () => { await delay(2, 25); return shared.lease; },
    writeLease: async (body: string) => { await delay(2, 25); shared.lease = body; return true; },
  };
  vi.doMock("@/lib/market-data", () => ({ fetchLiveQuotes: async () => ({}) }));
  vi.doMock("@/lib/test-hooks.server", () => ({ currentUserMayUseTestHooks: async () => false }));

  type Inst = { GET: (r: Request) => Promise<Response>; snap: typeof import("@/lib/crypto-snapshot") };
  async function instance(): Promise<Inst> {
    vi.resetModules();
    const snap = await import("@/lib/crypto-snapshot");
    snap.installSnapshotDurable(store);
    const route = await import("@/app/api/ticker/route");
    return { GET: route.GET, snap };
  }

  // A saved list exists before the burst (production always has one).
  const seed = await instance();
  const t0 = Date.parse("2026-10-18T18:13:59Z");
  await seed.snap.persistCryptoSnapshot(coins(400, 0) as never, new Date(t0).toISOString());
  await seed.snap.flushSnapshotWrites();

  const pool: Inst[] = [seed];
  for (let k = 0; k < 5; k += 1) pool.push(await instance());

  // Refresh burst: 8 refreshes from random instances, overlapping, as-of ~0.4-1.5 s apart.
  const refreshes: Promise<void>[] = [];
  for (let r = 1; r <= 8; r += 1) {
    const at = new Date(t0 + 280_000 + r * 700 + Math.floor(rnd() * 500)).toISOString();
    const who = pool[Math.floor(rnd() * pool.length)];
    refreshes.push((async () => {
      await delay(0, 1_200);
      await who.snap.persistCryptoSnapshot(coins(380 + Math.floor(rnd() * 20), r) as never, at);
    })());
  }

  let cookie = "";
  const loads: Load[] = [];
  for (let i = 1; i <= opts.loads; i += 1) {
    if (i % 9 === 0) pool.push(await instance()); // a cold instance joins mid-run
    const inst = pool[Math.floor(rnd() * pool.length)];
    const req = new Request("https://aetherforgeai.co.nz/api/ticker", { headers: opts.keepCookie && cookie ? { cookie } : {} });
    const res = await inst.GET(req);
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const body = (await res.json()) as { data?: { rows?: { crypto?: Array<{ symbol: string }> } } };
    const c = body.data?.rows?.crypto ?? [];
    const syms = c.map((x) => x.symbol.toUpperCase());
    loads.push({
      i, status: res.status, version: res.headers.get("x-af-snapshot-version") ?? "", at: res.headers.get("x-af-snapshot-at") ?? "",
      crypto: c.length, btc: syms.includes("BTC"), eth: syms.includes("ETH"), sol: syms.includes("SOL"),
    });
    await delay(10, 40);
  }
  await Promise.all(refreshes);
  for (const p of pool) await p.snap.flushSnapshotWrites();
  vi.doUnmock("@/lib/market-data");
  vi.doUnmock("@/lib/test-hooks.server");
  return loads;
}

function score(loads: Load[]) {
  let empty = 0, missing = 0, regress = 0, best = 0;
  const atByVersion = new Map<string, string>();
  let collisions = 0;
  for (const l of loads) {
    if (l.status === 200 && l.crypto === 0) empty += 1;
    if (!l.version || !l.at) missing += 1;
    const v = Number(l.version);
    if (v < best) regress += 1;
    best = Math.max(best, v);
    const prev = atByVersion.get(l.version);
    if (prev && prev !== l.at) collisions += 1;
    atByVersion.set(l.version, l.at);
  }
  return { empty, missing, regress, collisions, versions: new Set(loads.map((l) => l.version)).size };
}

describe("b35 H-1: repro.py logic against a simulated multi-instance refresh burst (60 loads)", () => {
  afterEach(() => vi.resetModules());

  for (const seed of [1, 7, 42]) {
    it(`seed ${seed}, browser with the version-floor cookie: 0 empty, 0 missing headers, 0 regressions`, async () => {
      const loads = await runBurst({ seed, keepCookie: true, loads: 60 });
      const s = score(loads);
      console.info(`[b35 H-1 sim] seed ${seed} cookie: ${JSON.stringify(s)}`);
      expect(loads).toHaveLength(60);
      expect(s.empty).toBe(0);
      expect(s.missing).toBe(0);
      expect(s.regress).toBe(0);
      expect(s.collisions).toBe(0);
      for (const l of loads) expect(l.btc && l.eth && l.sol).toBe(true);
    }, 60_000);

    it(`seed ${seed}, curl with no cookie (TT's repro.py): 0 empty, 0 missing headers, 0 regressions`, async () => {
      const loads = await runBurst({ seed, keepCookie: false, loads: 60 });
      const s = score(loads);
      console.info(`[b35 H-1 sim] seed ${seed} no-cookie: ${JSON.stringify(s)}`);
      expect(s.empty).toBe(0);
      expect(s.missing).toBe(0);
      expect(s.regress).toBe(0);
      expect(s.collisions).toBe(0);
    }, 60_000);
  }
});

describe("b35 H-1 unit rules", () => {
  it("the version is the as-of in epoch ms: unique per snapshot, never lower for a newer list", async () => {
    const { versionFor } = await import("@/lib/crypto-snapshot");
    expect(versionFor("2026-10-18T18:18:36.751Z")).not.toBe(versionFor("2026-10-18T18:18:38.334Z"));
    expect(versionFor("2026-10-18T18:18:45.719Z")).toBeGreaterThan(versionFor("2026-10-18T18:18:42.843Z"));
  });

  it("one refresh at a time: a second lease request while one is live is refused", async () => {
    vi.resetModules();
    const snap = await import("@/lib/crypto-snapshot");
    let lease: string | null = null;
    snap.installSnapshotDurable({
      read: async () => null, write: async () => true,
      readLease: async () => lease, writeLease: async (b: string) => { lease = b; return true; },
    });
    const first = await snap.acquireCryptoLease();
    expect(first).toBeTruthy();
    expect(await snap.acquireCryptoLease()).toBeNull();
    expect(await snap.acquireCryptoLease(Date.now() + snap.CRYPTO_LEASE_MS + 1)).toBeTruthy(); // expired lease is taken over
  });

  it("/status names the real reason: lost race and guard are not provider failures", async () => {
    const { attemptCode, attemptLabel, attemptIsGuard } = await import("@/lib/crypto-attempts");
    const race = attemptCode(new Error("unavailable: another server saved a newer list first"));
    const lease = attemptCode(new Error("unavailable: refresh lease held by another server"));
    const guard = attemptCode(new Error("unavailable: shorter list kept the previous one"));
    const empty = attemptCode(new Error("unavailable: no priced coins"));
    expect([race, lease, guard, empty]).toEqual(["lost-race", "lost-race", "guarded", "empty"]);
    expect(attemptIsGuard(race) && attemptIsGuard(guard)).toBe(true);
    expect(attemptLabel({ ok: false, code: race })).toMatch(/another server saved a newer list first \(list still served\)/);
    expect(attemptLabel({ ok: false, code: "empty" })).toMatch(/provider returned no priced coins/);
    expect(attemptLabel({ ok: false, code: "http-429" })).toBe("failed: provider answered HTTP 429");
  });

  it("no 200 with an empty crypto list: no copy at all is a 503; one read drives rows and headers", () => {
    const route = readFileSync("src/app/api/ticker/route.ts", "utf8");
    expect(route).toMatch(/status: 503/);
    expect(route).toMatch(/loadPublicTicker\(\{ snapshot: snap \}\)/);
    expect(route.match(/readCryptoSnapshot\(/g)).toHaveLength(1);
    const markets = readFileSync("src/app/api/crypto/markets/route.ts", "utf8");
    expect(markets).toMatch(/x-af-snapshot-stale/);
    expect(markets).toMatch(/status: 503/);
  });

  it("the version floor rides in a cookie or header", async () => {
    const { snapshotFloorFrom, snapshotFloorCookie } = await import("@/lib/snapshot-floor");
    expect(snapshotFloorFrom(new Request("https://x/", { headers: { cookie: "a=1; af_snap_v=1792371660000" } }))).toBe(1792371660000);
    expect(snapshotFloorFrom(new Request("https://x/", { headers: { "x-af-snapshot-floor": "5" } }))).toBe(5);
    expect(snapshotFloorCookie(9)).toMatch(/^af_snap_v=9; Path=\/; Max-Age=900; SameSite=Lax; Secure$/);
  });
});

describe("b35 H-15: Twelve Data named; key presence only", () => {
  it("/trust source line names Twelve Data as used when configured", async () => {
    const { publicDataSourcesLine } = await import("@/lib/data-sources");
    expect(publicDataSourcesLine()).toMatch(/When configured, Twelve Data is also used as a share-quote source\./);
  });
  it("the key hook reports presence only, allow-listed, never the value", () => {
    const s = readFileSync("src/app/api/test-hooks/market-data-key/route.ts", "utf8");
    expect(s).toMatch(/testHooksAllowedFor\(user\)/);
    expect(s).toMatch(/marketDataKeyPresent: present/);
    expect(s).not.toMatch(/MARKET_DATA_API_KEY\s*[,}]|\.length|slice\(/);
  });
  it("CryptoCompare news still runs without a key", () => {
    expect(readFileSync("src/lib/market-news.ts", "utf8")).toMatch(/\(key \? `&api_key=/);
  });
});

describe("b35 Sections 3–5", () => {
  it("G-24: dateless pasted rows take the chosen date; dated rows keep theirs", async () => {
    const { parsePastedTrades } = await import("@/lib/paste-import");
    const { withDate, nzToday } = await import("@/lib/paste-date");
    const { rows } = parsePastedTrades("Bought 25 FPH.NZ at NZ$28.50");
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBeNull();
    expect(withDate(rows, "2026-10-19")[0].date).toBe("2026-10-19");
    expect(withDate([{ ...rows[0], date: "2026-10-01" }], "2026-10-19")[0].date).toBe("2026-10-01");
    expect(nzToday(new Date("2026-10-18T12:00:00Z"))).toBe("2026-10-19");
    const panel = readFileSync("src/components/import/BrokerImportPanel.tsx", "utf8");
    expect(panel).toMatch(/Date missing/);
    expect(panel).toMatch(/data-paste-date-missing/);
  });
  it("M-3: a bot page body does not repeat the lede's opening sentence", async () => {
    vi.doMock("next/image", () => ({ default: () => null }));
    const { dropRepeatedLede } = await import("@/components/public/BotGuide");
    const { BOT_GUIDE_PARAGRAPHS } = await import("@/lib/bot-guides");
    const out = dropRepeatedLede("Stox is the share-market bot. It writes notes.", BOT_GUIDE_PARAGRAPHS.stox);
    expect(out[0]).not.toMatch(/^Stox is the share-market bot\./);
    expect(out[0]).toMatch(/^It reads the shares you enter/);
    const hm = dropRepeatedLede("The Headmaster is the planning bot for the paper book. More.", BOT_GUIDE_PARAGRAPHS.headmaster);
    expect(hm[0]).not.toMatch(/^The Headmaster is the planning bot\./);
    expect(dropRepeatedLede("Something else.", ["Keep me."])).toEqual(["Keep me."]);
  });
  it("CR-6: the plan-limits hook is allow-listed, read-only and names no tickers", () => {
    const s = readFileSync("src/app/api/test-hooks/plan-limits/route.ts", "utf8");
    expect(s).toMatch(/testHooksAllowedFor\(user\)/);
    expect(s).toMatch(/checkTickerQuota\(user, held as never, kind\)/);
    expect(s).not.toMatch(/crud\.(create|update|delete)/);
    expect(s).not.toMatch(/ticker:\s*h\./);
  });
});
