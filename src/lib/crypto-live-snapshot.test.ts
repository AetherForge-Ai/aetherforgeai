import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { coinGeckoEndpoint, COINGECKO_PRO_BASE, COINGECKO_PUBLIC_BASE, redactSecrets } from "@/lib/coingecko-auth";
import { columnHasFigure, listedMarketNotice, noticeWithAsOf } from "@/lib/crypto-coverage";
import { probeErrorClass, runCryptoDiagnostics } from "@/lib/crypto-diagnostics";
import { selectListedMarkets } from "@/lib/crypto-list";
import type { CoinMarket } from "@/lib/crypto-market";
import {
  clearSnapshotMemory,
  CRYPTO_SNAPSHOT_TICKER,
  DEX_SNAPSHOT_TICKER,
  hiddenSnapshotTicker,
  installSnapshotDurable,
  persistCryptoSnapshot,
  persistDexSnapshot,
  readCryptoSnapshot,
  resetCryptoSnapshotsForTests,
  snapshotWorthSaving,
  type SnapshotDurable,
  type SnapshotId,
} from "@/lib/crypto-snapshot";
import type { DexTokenRow } from "@/lib/crypto-dex";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function coin(partial: Partial<CoinMarket> & Pick<CoinMarket, "symbol">): CoinMarket {
  return {
    id: partial.id || partial.symbol.toLowerCase(),
    name: partial.name || partial.symbol,
    image: "",
    rank: partial.rank ?? 1,
    price: partial.price ?? 10,
    marketCap: partial.marketCap ?? 1_000_000,
    fdv: null,
    volume24h: partial.volume24h ?? 100,
    change1h: null,
    change24h: 1,
    change7d: 2,
    high24h: null,
    low24h: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    athDate: null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    source: partial.source || "coingecko",
    quotedAt: partial.quotedAt ?? "2026-10-11T00:00:00.000Z",
    ...partial,
  };
}

function many(count: number, source = "coingecko"): CoinMarket[] {
  return Array.from({ length: count }, (_, index) =>
    coin({
      symbol: `C${index}`,
      id: `coin-${index}`,
      name: `Coin ${index}`,
      rank: index + 1,
      price: index + 1,
      marketCap: 1_000_000 - index,
      source,
    })
  );
}

function memoryDurable(): SnapshotDurable & { store: Map<SnapshotId, string> } {
  const store = new Map<SnapshotId, string>();
  return {
    store,
    async read(id) {
      return store.get(id) ?? null;
    },
    async write(id, body) {
      store.set(id, body);
      return true;
    },
  };
}

const previousKey = process.env.COINGECKO_API_KEY;
const previousPro = process.env.COINGECKO_PRO;

afterEach(() => {
  resetCryptoSnapshotsForTests();
  if (previousKey == null) delete process.env.COINGECKO_API_KEY;
  else process.env.COINGECKO_API_KEY = previousKey;
  if (previousPro == null) delete process.env.COINGECKO_PRO;
  else process.env.COINGECKO_PRO = previousPro;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pull-check:crypto-live-2026-10-11", () => {
  it("is marked in source and the qa file", () => {
    const qa = read("qa/PULL-CHECK-2026-10-10.md");
    expect(qa).toContain("pull-check:crypto-live-2026-10-11");
    expect(read("src/lib/coingecko-auth.ts")).toContain("pull-check:crypto-live-2026-10-11");
    expect(read("src/lib/crypto-snapshot.ts")).toContain("pull-check:crypto-live-2026-10-11");
    expect(read("src/lib/crypto-diagnostics.ts")).toContain("pull-check:crypto-live-2026-10-11");
    expect(read("src/app/api/admin/crypto-diagnostics/route.ts")).toContain("pull-check:crypto-live-2026-10-11");
    expect(read("src/app/api/admin/crypto-diagnostics/route.ts")).toContain("PRIVACY_OFFICER_EMAIL");
    expect(read("src/app/changelog/page.tsx")).toContain("47f44d9");
  });

  it("uses a demo header, a pro host, or keyless, and does not put the key in the URL", () => {
    delete process.env.COINGECKO_API_KEY;
    delete process.env.COINGECKO_PRO;
    expect(coinGeckoEndpoint().mode).toBe("keyless");
    expect(coinGeckoEndpoint().base).toBe(COINGECKO_PUBLIC_BASE);
    expect(coinGeckoEndpoint().headers["x-cg-demo-api-key"]).toBeUndefined();

    process.env.COINGECKO_API_KEY = "demo-secret-value";
    const demo = coinGeckoEndpoint();
    expect(demo.mode).toBe("demo");
    expect(demo.base).toBe(COINGECKO_PUBLIC_BASE);
    expect(demo.headers["x-cg-demo-api-key"]).toBe("demo-secret-value");
    expect(demo.base).not.toContain("demo-secret-value");

    process.env.COINGECKO_PRO = "on";
    const pro = coinGeckoEndpoint();
    expect(pro.mode).toBe("pro");
    expect(pro.base).toBe(COINGECKO_PRO_BASE);
    expect(pro.headers["x-cg-pro-api-key"]).toBe("demo-secret-value");
    expect(pro.headers["x-cg-demo-api-key"]).toBeUndefined();

    const plain = coinGeckoEndpoint(process.env, true);
    expect(plain.mode).toBe("keyless");
    expect(plain.base).toBe(COINGECKO_PUBLIC_BASE);
    expect(JSON.stringify(plain.headers)).not.toContain("demo-secret-value");
    expect(redactSecrets("CoinGecko 401 demo-secret-value", process.env)).not.toContain("demo-secret-value");
  });

  it("serves the saved list instead of the Yahoo fallback", () => {
    const saved = many(120);
    const yahoo = many(89, "yahoo").map((row) => ({ ...row, marketCap: 0, volume24h: 0 }));
    const selected = selectListedMarkets({
      coingecko: [],
      page2Missing: true,
      backup: [],
      saved,
      yahoo,
    });
    expect(selected.reason).toBe("saved");
    expect(selected.coins).toHaveLength(120);
    expect(selected.coins.some((row) => row.source === "yahoo")).toBe(false);
    expect(snapshotWorthSaving(yahoo)).toBe(false);
    expect(snapshotWorthSaving(saved)).toBe(true);
    expect(listedMarketNotice(120, "saved")).toMatch(/Last saved CoinGecko list/);
    expect(noticeWithAsOf(listedMarketNotice(120, "saved"), "11 Oct 2026, 1:00 pm")).toMatch(/As of 11 Oct 2026, 1:00 pm/);
    expect(columnHasFigure(yahoo.map((row) => row.marketCap))).toBe(false);
    expect(columnHasFigure(saved.map((row) => row.marketCap))).toBe(true);
  });

  it("keeps the last good list after the in-process copy is cleared", async () => {
    const durable = memoryDurable();
    installSnapshotDurable(durable);
    const coins = many(150);
    await persistCryptoSnapshot(coins, "2026-10-11T01:00:00.000Z");
    clearSnapshotMemory();
    const again = await readCryptoSnapshot(50);
    expect(again?.coins).toHaveLength(150);
    expect(again?.at).toBe("2026-10-11T01:00:00.000Z");
    expect(again?.coins[0].marketCap).toBeGreaterThan(0);
    const row: DexTokenRow = {
      id: "eth_0xabc",
      symbol: "ABC",
      name: "Abc",
      price: 1.25,
      priceUnavailable: false,
      volume24h: 10,
      network: "Ethereum",
      dex: "Example",
      detailId: "abc-token",
    };
    await persistDexSnapshot([row], "2026-10-11T01:05:00.000Z");
    clearSnapshotMemory();
    const dex = await import("@/lib/crypto-snapshot");
    const savedDex = await dex.readDexSnapshot(50);
    expect(savedDex?.rows).toHaveLength(1);
    expect(savedDex?.rows[0].price).toBe(1.25);
  });

  it("stops waiting when the stored read does not return", async () => {
    installSnapshotDurable({
      read: () => new Promise(() => {}),
      write: async () => true,
    });
    const started = Date.now();
    const result = await readCryptoSnapshot(40);
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("classifies 429, 403, timeout, and parse without returning a body or a key", async () => {
    expect(probeErrorClass({ status: 429, timedOut: false, parsed: true, httpOk: false })).toBe("429");
    expect(probeErrorClass({ status: 1015, timedOut: false, parsed: true, httpOk: false })).toBe("429");
    expect(probeErrorClass({ status: 403, timedOut: false, parsed: true, httpOk: false })).toBe("403");
    expect(probeErrorClass({ status: null, timedOut: true, parsed: false, httpOk: false })).toBe("timeout");
    expect(probeErrorClass({ status: 200, timedOut: false, parsed: false, httpOk: true })).toBe("parse");

    process.env.COINGECKO_API_KEY = "cg-test-key-not-for-logs";
    delete process.env.COINGECKO_PRO;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes("coingecko")) {
          return new Response("body includes cg-test-key-not-for-logs", { status: 429 });
        }
        if (href.includes("geckoterminal")) {
          return new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html" } });
        }
        if (href.includes("kraken")) {
          const error = new Error("timed out");
          error.name = "TimeoutError";
          throw error;
        }
        return new Response("forbidden body", { status: 403 });
      })
    );
    const report = await runCryptoDiagnostics();
    const packed = JSON.stringify(report);
    expect(packed).not.toContain("cg-test-key-not-for-logs");
    expect(packed).not.toContain("forbidden body");
    expect(packed).not.toContain("<html>");
    const byId = Object.fromEntries(report.probes.map((probe) => [probe.id, probe]));
    expect(byId.coingecko.error).toBe("429");
    expect(byId.coingecko.status).toBe(429);
    expect(byId.coingecko.mode).toBe("demo");
    expect(byId.coingecko.rows).toBe(0);
    expect(byId.geckoterminal.error).toBe("parse");
    expect(byId.kraken.error).toBe("timeout");
    expect(byId.coinbase.error).toBe("403");
    expect(byId.coinbase.status).toBe(403);
    expect(hiddenSnapshotTicker(CRYPTO_SNAPSHOT_TICKER)).toBe(true);
    expect(hiddenSnapshotTicker(DEX_SNAPSHOT_TICKER)).toBe(true);
    expect(read("src/app/api/watchlist/route.ts")).toContain("hiddenSnapshotTicker");
  });
});
