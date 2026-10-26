// pull-check:v3-goal-b30-2026-10-19
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

vi.mock("server-only", () => ({}));

const read = (p: string) => readFileSync(p, "utf8");

describe("b30 version bump", () => {
  it("marker and pull-check line ship with the runtime", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7)-b(30|3[1-9]|[4-9]\d)[a-z]?-/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b30-2026-10-19");
  });
});

describe("CR-2 guide facts", () => {
  it("knowledge carries plans.ts prices, NZD, FIF rule and no GST / wrong price / referral", async () => {
    const { PERSONAL_GUIDE_KNOWLEDGE, PERSONAL_GUIDE_SYSTEM_PROMPT } = await import("@/lib/personal-guide-knowledge");
    const { PORTFOLIO_COACH_SYSTEM_PROMPT } = await import("@/lib/portfolio-coach-knowledge");
    for (const text of [PERSONAL_GUIDE_KNOWLEDGE, PERSONAL_GUIDE_SYSTEM_PROMPT, PORTFOLIO_COACH_SYSTEM_PROMPT]) {
      expect(text).toContain("NZ$16/mo");
      expect(text).toContain("NZ$49/mo");
      expect(text).toContain("NZ$160/yr");
      expect(text).toContain("From NZ$199/mo — Talk to us");
      expect(text).toContain("All prices in NZD");
      expect(text).not.toMatch(/NZ\$19\b/);
      expect(text).not.toMatch(/\bGST\b/);
      expect(text).toContain("NZ$50,000");
      expect(text).toContain("NZ$100,000");
      expect(text).toMatch(/1 April to 31 March/);
      expect(text).toMatch(/recorded, never executed/);
      expect(text).toMatch(/not a direct NZX or ASX feed/);
      expect(text).toMatch(/say you don't know rather than guess/i);
      expect(text).not.toMatch(/https?:\/\/(www\.)?(sharesies|tigerbrokers|binance|blackbull|payitnow)/i);
      expect(text).not.toMatch(/1,000,000\+ investors/);
      expect(text).not.toMatch(/Educational \/ execution help/);
    }
  });

  it("no broker is named in the answer to 'which broker should I use?'", async () => {
    const { personalGuideFallbackReply } = await import("@/lib/personal-guide-knowledge");
    const { BANNED_PLATFORM_NAMES } = await import("@/lib/guide-facts");
    const reply = personalGuideFallbackReply("Which broker should I use?");
    for (const name of BANNED_PLATFORM_NAMES) expect(reply).not.toContain(name);
  });

  it("a recorded guide reply with a NZ$ plan price not in plans.ts fails", async () => {
    const { unknownPlanPrices, allowedPlanPricesNzd } = await import("@/lib/guide-facts");
    expect(allowedPlanPricesNzd()).toEqual(expect.arrayContaining([0, 16, 49, 160, 490, 199]));
    expect(unknownPlanPrices("Starter is NZ$16/mo and Pro is NZ$49/mo.")).toEqual([]);
    expect(unknownPlanPrices("Starter is NZ$19/mo.")).toEqual([19]);
    const { personalGuideFallbackReply } = await import("@/lib/personal-guide-knowledge");
    expect(unknownPlanPrices(personalGuideFallbackReply("How much does it cost?"))).toEqual([]);
  });

  it("every Assistant reply ends with the fixed disclaimer", async () => {
    const { withAssistantDisclaimer, GUIDE_REPLY_DISCLAIMER } = await import("@/lib/guide-safety");
    expect(GUIDE_REPLY_DISCLAIMER).toBe("General information, not financial advice.");
    const out = withAssistantDisclaimer("Step 1.\n\n_Educational / execution help — not personalised financial advice._");
    expect(out.endsWith("General information, not financial advice.")).toBe(true);
    expect(out).not.toMatch(/execution help/);
    expect(withAssistantDisclaimer(out)).toBe(out);
  });
});

describe("atomic per-email login counter", () => {
  beforeEach(async () => {
    const m = await import("@/lib/ip-rate-limit");
    m.resetRateLimits();
    m.resetAtomicLimits();
  });

  it("15 concurrent attempts with 50–200 ms store latency allow exactly 10", async () => {
    const { takeAtomicLimit, AUTH_EMAIL_LIMIT, AUTH_EMAIL_WINDOW_MS } = await import("@/lib/ip-rate-limit");
    const counts = new Map<string, number>();
    const store = {
      async increment(key: string) {
        const value = (counts.get(key) ?? 0) + 1; // the store increments first (atomic)
        counts.set(key, value);
        await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
        return value;
      },
    };
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 15 }, () => takeAtomicLimit("login:email:abc", AUTH_EMAIL_LIMIT, AUTH_EMAIL_WINDOW_MS, now, { store, useCache: false }))
    );
    expect(AUTH_EMAIL_LIMIT).toBe(10);
    expect(results.filter((r) => r.allowed).length).toBe(10);
  });

  it("the sign-in route uses the atomic counter for the email bucket", () => {
    expect(read("src/app/api/auth/[...all]/route.ts")).toMatch(/takeAtomicLimit\(`login:email:/);
  });
});

describe("H-1 shared versioned snapshot", () => {
  afterEach(() => vi.useRealTimers());

  it("two isolates never go backwards in as-of or version", async () => {
    const shared = { body: null as string | null };
    const durable = {
      read: async () => shared.body,
      write: async (_id: string, body: string) => {
        shared.body = body;
        return true;
      },
    };
    const coins = (n: number, src = "coingecko") =>
      Array.from({ length: n }, (_, i) => ({
        id: `c${i}`, symbol: `C${i}`, name: `Coin ${i}`, image: "", rank: i + 1, price: 1 + i, marketCap: 1e9 - i, volume24h: 1e6,
        change24h: 0, change7d: 0, change1h: 0, fdv: null, high24h: null, low24h: null, circulatingSupply: null, totalSupply: null,
        maxSupply: null, ath: null, athDate: null, atl: null, atlDate: null, sparkline7d: [], blockchain: "", quotedAt: null, source: src,
        priceUnavailable: false, moves: null,
      }));
    vi.resetModules();
    const a = await import("@/lib/crypto-snapshot");
    a.installSnapshotDurable(durable);
    vi.resetModules();
    const b = await import("@/lib/crypto-snapshot");
    b.installSnapshotDurable(durable);
    expect(a).not.toBe(b);

    const t0 = Date.parse("2026-10-19T01:00:00Z");
    await a.persistCryptoSnapshot(coins(300) as never, new Date(t0).toISOString());
    const seenA: Array<[number, string]> = [];
    const seenB: Array<[number, string]> = [];
    const snapA1 = await a.readCryptoSnapshot();
    const snapB1 = await b.readCryptoSnapshot();
    seenA.push([snapA1!.version, snapA1!.at]);
    seenB.push([snapB1!.version, snapB1!.at]);
    // B writes a newer list; A tries to write an older one afterwards (must be refused).
    await b.persistCryptoSnapshot(coins(300) as never, new Date(t0 + 60_000).toISOString());
    await a.persistCryptoSnapshot(coins(300) as never, new Date(t0 + 30_000).toISOString());
    vi.useFakeTimers({ now: Date.now() + a.SNAPSHOT_LOCAL_TTL_MS + 10, toFake: ["Date"] });
    const snapA2 = await a.readCryptoSnapshot();
    const snapB2 = await b.readCryptoSnapshot();
    seenA.push([snapA2!.version, snapA2!.at]);
    seenB.push([snapB2!.version, snapB2!.at]);
    for (const seen of [seenA, seenB]) {
      for (let i = 1; i < seen.length; i += 1) {
        expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
        expect(seen[i][1] >= seen[i - 1][1]).toBe(true);
      }
    }
    expect(snapA2!.at).toBe(new Date(t0 + 60_000).toISOString());
    // b35 H-1: the version is the as-of in epoch ms (unique per snapshot, rises with as-of).
    expect(snapA2!.version).toBe(t0 + 60_000);
    expect(a.snapshotHeaders(snapA2)).toEqual({ "x-af-snapshot-at": snapA2!.at, "x-af-snapshot-version": String(t0 + 60_000) });
  });

  it("a fallback provider replaces the primary only after the documented threshold", async () => {
    const m = await import("@/lib/crypto-snapshot");
    expect(m.FALLBACK_REPLACES_PRIMARY_AFTER_MS).toBe(10 * 60 * 1000);
    expect(m.SNAPSHOT_LOCAL_TTL_MS).toBeLessThanOrEqual(5_000);
  });

  it("markets API and ticker send both snapshot headers", () => {
    expect(read("src/app/api/crypto/markets/route.ts")).toContain('"x-af-snapshot-version"');
    expect(read("src/app/api/ticker/route.ts")).toContain("snapshotHeaders(snap)");
    expect(read("src/app/markets/page.tsx")).toContain("snapshotMetaOther");
    expect(read("src/app/markets/crypto/[id]/page.tsx")).toContain("snapshotMetaOther");
  });
});

describe("H-15 price providers", () => {
  it("every provider host called from crypto-*.ts is listed for /trust", async () => {
    const { CRYPTO_PRICE_PROVIDERS, publicDataSourcesLine } = await import("@/lib/data-sources");
    const listed = new Set(CRYPTO_PRICE_PROVIDERS.flatMap((p) => p.hosts));
    const files = readdirSync("src/lib").filter((f) => /^crypto-.*\.ts$/.test(f) && !f.includes(".test."));
    const apiHost = /https:\/\/((?:api|rest|data-api|query1|query2|pro-api)\.[a-z0-9.-]+)/g;
    for (const f of files) {
      for (const m of read(`src/lib/${f}`).matchAll(apiHost)) {
        if (/docs\./.test(m[1])) continue;
        expect(listed.has(m[1]), `${f} calls ${m[1]}`).toBe(true);
      }
    }
    expect(publicDataSourcesLine()).toContain("CoinPaprika");
  });
});

describe("G-17 cross-provider ids", () => {
  it("whitebit and leo-token map to both providers", () => {
    const src = read("src/lib/crypto-depth.server.ts");
    expect(src).toContain('whitebit: { gecko: "whitebit", paprika: "wbt-whitebit"');
    expect(src).toContain('"leo-token": { gecko: "leo-token", paprika: "leo-leo-token"');
  });
});

describe("G-10 durable book version", () => {
  it("a book write bumps the durable version and cached reads check it", async () => {
    const { parseBookVersion } = await import("@/lib/book-version.server");
    expect(parseBookVersion('{"v":3,"at":5}')).toEqual({ v: 3, at: 5 });
    expect(parseBookVersion("junk")).toEqual({ v: 0, at: 0 });
    expect(read("src/lib/book-cache.server.ts")).toContain("readBookVersionKnown(userId)");
    expect(read("src/lib/transactions.ts")).toContain('import "@/lib/book-version.server"');
    const { hiddenSnapshotTicker } = await import("@/lib/crypto-snapshot");
    expect(hiddenSnapshotTicker("AF-BV")).toBe(true);
  });
  it("delete keeps the last list while the read is in flight", () => {
    expect(read("src/components/dashboard/TransactionsTab.tsx")).toContain("deletesInFlight.current");
  });
});

describe("H-4 report list starts with the book", () => {
  it("dashboard prefetches and Report Center takes it", () => {
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("prefetchReportsList()");
    expect(read("src/components/dashboard/ReportCenter.tsx")).toContain("takePrefetchedReports");
  });
});

describe("H-9 overseas fixture", () => {
  it("US holdings alone pass NZ$50,000 and the exempt ASX share is excluded", async () => {
    const { overseasFixtureRows, overseasFixtureUsCostNzd } = await import("@/lib/overseas-fixture");
    const { buildFifPaper, fifClass } = await import("@/lib/fif-working-paper");
    expect(overseasFixtureUsCostNzd()).toBeGreaterThan(50_000);
    expect(fifClass("BHP.AX", "stock")).toBe("australian");
    expect(fifClass("XYZ.AX", "stock")).toBe("attributable");
    const { rows, split } = overseasFixtureRows();
    expect(rows.some((r) => r.dividend_drp_shares)).toBe(true);
    expect(split.ratio).toBe(2);
    const ledger = rows
      .filter((r) => r.type === "buy")
      .map((r) => ({ type: r.type, ticker: r.ticker, asset_type: "stock", quantity: r.quantity, price: r.price, fx_rate: r.fx_rate, currency: r.ticker!.endsWith(".AX") ? "AUD" : "USD", executed_at: `${r.trade_date}T10:00:00+12:00` }));
    const paper = buildFifPaper({ rows: ledger as never, markets: [], endingYear: 2027 });
    expect(paper.peakCostNzd!).toBeGreaterThan(50_000);
    expect(paper.peakCostNzd!).toBeLessThan(77_000); // BHP not counted
    expect(paper.australian.map((p) => p.ticker)).toEqual(["BHP.AX"]);
    expect(paper.threshold).toBe("over");
  });
  it("the seed hook is 404 unless allow-listed and has no password literal", () => {
    const route = read("src/app/api/test-hooks/seed-overseas/route.ts");
    expect(route).toContain("testHooksAllowedFor");
    expect(route).toContain("status: 404");
    expect(read("scripts/seed-overseas-fixture.mjs")).toContain("process.env.FIXTURE_PASSWORD");
  });
});

describe("G-05 feed freshness hook (PR #447)", () => {
  it("forged cookie does nothing without the allow-list", async () => {
    const { readFeedForce } = await import("@/lib/feed-freshness-hook");
    expect(readFeedForce("af_test_feed_force=crypto:failed", false)).toBeNull();
    expect(readFeedForce("af_test_feed_force=crypto:failed", true)).toEqual({ name: "crypto", state: "failed" });
    expect(read("src/app/test-hooks/feed-freshness/page.tsx")).toContain("notFound()");
  });
});
