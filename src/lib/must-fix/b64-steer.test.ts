// pull-check:v3-goal-b64-2026-10-24
// b64 steering from TT's b63 grade: DEX P2 (retry, fallback, per-source reason), /markets SWR memo (P3),
// crypto footer "Showing 1–25 of 400" (P3), search header "N matches".
import { afterEach, describe, expect, it } from "vitest";
import {
  dexSourceReason,
  dexSourceSummary,
  installSeedFetch,
  loadKeylessDexMarkets,
  resetSeedFetch,
  setDexRetryDelaysForTests,
} from "@/lib/crypto-keyless-seed";
import { cryptoFooterLine, cryptoHeaderCount } from "@/lib/crypto-coverage";
import { dexStatusRow } from "@/lib/status-feeds";
import { swrMemo } from "@/lib/swr-memo";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const paprikaPool = {
  results: [
    {
      chain: "ethereum",
      dex_name: "Uniswap",
      price_usd: 0.0000042,
      volume_usd_24h: 1_000_000,
      liquidity_usd: 80_000,
      tokens: [{ id: "0x6982508145454ce325ddbe47a25d4ec3d2311933", chain: "ethereum" }],
    },
  ],
};

afterEach(() => {
  resetSeedFetch();
  setDexRetryDelaysForTests(null);
});

describe("b64 DEX P2: retry with backoff, fallback, per-source reason", () => {
  it("retries a 429 page and keeps the rows it then returns", async () => {
    setDexRetryDelaysForTests([1, 1]);
    let calls = 0;
    installSeedFetch(async (url) => {
      const href = String(url);
      if (href.includes("geckoterminal.com")) return json({}, 503);
      if (href.includes("dexpaprika.com") && href.includes("ethereum")) {
        calls += 1;
        return calls === 1 ? json({}, 429) : json(paprikaPool);
      }
      return json({ results: [] });
    });
    const loaded = await loadKeylessDexMarkets({ budgetMs: 2_000 });
    expect(calls).toBe(2);
    expect(loaded.sources).toEqual(["dexpaprika"]);
    expect(loaded.rows.map((r) => r.symbol)).toContain("PEPE");
    const summary = dexSourceSummary();
    expect(summary).toContain("GeckoTerminal: HTTP 503 on 5 of 5 pages");
    expect(summary).toMatch(/DexPaprika: \d+ rows/);
  });

  it("one thrown page no longer empties the whole source", async () => {
    setDexRetryDelaysForTests([1]);
    installSeedFetch(async (url) => {
      const href = String(url);
      if (href.includes("geckoterminal.com")) return json({}, 429);
      if (href.includes("solana")) throw Object.assign(new Error("t"), { name: "TimeoutError" });
      if (href.includes("ethereum")) return json(paprikaPool);
      return json({ results: [] });
    });
    const loaded = await loadKeylessDexMarkets({ budgetMs: 2_000 });
    expect(loaded.rows.length).toBeGreaterThan(0);
    expect(dexSourceSummary()).toContain("timed out on 1 of 4 pages");
  });

  it("names both sources when both come back empty", async () => {
    setDexRetryDelaysForTests([1]);
    installSeedFetch(async () => json({}, 429));
    const loaded = await loadKeylessDexMarkets({ budgetMs: 2_000 });
    expect(loaded.rows).toHaveLength(0);
    const summary = dexSourceSummary();
    expect(summary).toContain("GeckoTerminal: HTTP 429");
    expect(summary).toContain("DexPaprika: HTTP 429");
    expect(summary).not.toMatch(/did not return a list/);
  });

  it("dexSourceReason groups failures; /status shows the per-source note", () => {
    expect(dexSourceReason([null, "HTTP 429", "HTTP 429", "timed out"])).toBe("HTTP 429 on 2 of 4 pages; timed out on 1 of 4 pages");
    expect(dexSourceReason([null, null])).toBeNull();
    const now = Date.parse("2026-10-24T05:00:00Z");
    const row = dexStatusRow("2026-10-24T04:55:00Z", null, now, "GeckoTerminal: HTTP 429 on 5 of 5 pages; DexPaprika: 40 rows");
    expect(row.text).toContain("GeckoTerminal: HTTP 429");
    const failed = dexStatusRow("2026-10-24T03:00:00Z", { at: "2026-10-24T04:59:00Z", reason: "GeckoTerminal: timed out on 5 of 5 pages; DexPaprika: HTTP 429 on 4 of 4 pages. The previous snapshot was kept." }, now);
    expect(failed.text).toContain("DexPaprika: HTTP 429");
  });
});

describe("b64 P3 /markets: in-code stale-while-revalidate memo", () => {
  it("serves the cached value at once after the fresh window and refreshes in the background", async () => {
    let t = 0;
    let loads = 0;
    let release: (() => void) | null = null;
    const memo = swrMemo(
      () => {
        loads += 1;
        if (loads === 1) return Promise.resolve("v1");
        return new Promise<string>((resolve) => (release = () => resolve("v2")));
      },
      { freshMs: 10, staleMs: 1_000, now: () => t }
    );
    expect(await memo.get()).toBe("v1");
    t = 50;
    expect(await memo.get()).toBe("v1"); // stale, served without waiting
    expect(loads).toBe(2);
    release!();
    await new Promise((r) => setTimeout(r, 0));
    expect(await memo.get()).toBe("v2");
  });

  it("an empty refresh never replaces a good value; past staleMs the caller waits", async () => {
    let t = 0;
    const values = ["good", "", "late"];
    const memo = swrMemo(async () => values.shift() ?? "", { freshMs: 10, staleMs: 100, keep: (v) => !!v, now: () => t });
    expect(await memo.get()).toBe("good");
    t = 20;
    expect(await memo.get()).toBe("good");
    await new Promise((r) => setTimeout(r, 0));
    expect(memo.peek()).toBe("good");
    t = 500;
    expect(await memo.get()).toBe("late");
  });
});

describe("b64 P3 crypto footer and search header", () => {
  it("footer reads Showing 1–25 of 400 under the 400 header", () => {
    expect(cryptoFooterLine(0, 25, 25, 400, "")).toBe("Showing 1–25 of 400");
    expect(cryptoFooterLine(1, 25, 400, 400, "")).toBe("Showing 26–50 of 400");
    expect(cryptoFooterLine(15, 25, 400, 400, "")).toBe("Showing 376–400 of 400");
  });
  it("a search counts its matches in the footer and the header", () => {
    expect(cryptoFooterLine(0, 25, 8, 400, "btc")).toBe("Showing 1–8 of 8");
    expect(cryptoHeaderCount(400, 8, "btc")).toBe("8 matches");
    expect(cryptoHeaderCount(400, 1, "bitcoin")).toBe("1 match");
    expect(cryptoHeaderCount(400, 0, "zzz")).toBe("0 matches");
    expect(cryptoHeaderCount(400, 25, "")).toBe("400 coins");
  });
});
