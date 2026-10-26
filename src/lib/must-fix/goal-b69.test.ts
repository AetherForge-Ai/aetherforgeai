// pull-check:v3-fix-b77-2026-10-27
/** b69 (Chief, 27 Oct 2026): TT b68 P2s — /api/crypto duplicate ids, REG-1 static chunk 520 recovery. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CoinMarket } from "@/lib/crypto-market";
import { dedupeCoinsById, renamedCoinSymbol } from "@/lib/crypto-market";
import { mergeVerifiedSeedLists } from "@/lib/crypto-keyless-seed";
import { mergeRankedCoins } from "@/lib/crypto-list";
import { retainDepthCoins } from "@/lib/crypto-depth-record";
import { CHUNK_RETRY_SNIPPET } from "@/lib/chunk-retry";

const read = (p: string) => readFileSync(p, "utf8");

function coin(id: string, symbol: string, rank: number, source = "coingecko", price = 1 + rank / 1000): CoinMarket {
  return {
    id, symbol, name: symbol, image: "", rank, price,
    marketCap: 1e12 / rank, fdv: null, volume24h: 1e6, change1h: null, change24h: 0, change7d: 0,
    high24h: null, low24h: null, circulatingSupply: null, totalSupply: null, maxSupply: null,
    ath: null, athDate: null, atl: null, atlDate: null, sparkline7d: [], blockchain: "",
    quotedAt: new Date().toISOString(), source, priceUnavailable: false,
  } as unknown as CoinMarket;
}

/** TT b68 repro: 400 CoinGecko rows plus backup rows whose ids collide with a different coin. */
function fixture() {
  const cg: CoinMarket[] = [];
  for (let i = 1; i <= 400; i++) cg.push(coin(`coin-${i}`, `C${i}`, i));
  cg[84] = coin("polygon-ecosystem-token", "POL", 85);
  cg[20] = coin("the-open-network", "GRAM", 21);
  cg[150] = coin("falcon-finance", "USDF", 151);
  cg[160] = coin("usdai", "USDAI", 161);
  cg[170] = coin("baby-doge-coin", "BABYDOGE", 171);
  const backup = [
    coin("polygon-ecosystem-token", "MATIC", 192, "coinpaprika", 1.085),
    coin("the-open-network", "TON", 30, "coinpaprika", 1.6),
    coin("falcon-finance", "FF", 140, "coinpaprika", 0.1),
    coin("usdai", "CHIP", 300, "coinpaprika", 0.2),
    coin("baby-doge-coin", "1MBABYDOGE", 350, "coinpaprika", 0.001),
  ];
  const extra: CoinMarket[] = [];
  for (let i = 401; i <= 420; i++) extra.push(coin(`coin-${i}`, `C${i}`, i));
  return { cg, backup, extra };
}

function assertUnique400(rows: CoinMarket[]) {
  const ids = rows.map((r) => r.id);
  expect(rows.length).toBe(400);
  expect(new Set(ids).size).toBe(400);
  expect(rows.some((r) => r.symbol === "MATIC")).toBe(false);
  const by = (id: string) => rows.filter((r) => r.id === id).map((r) => r.symbol);
  expect(by("polygon-ecosystem-token")).toEqual(["POL"]);
  expect(by("the-open-network")).toEqual(["GRAM"]);
  expect(by("falcon-finance")).toEqual(["USDF"]);
  expect(by("usdai")).toEqual(["USDAI"]);
  expect(by("baby-doge-coin")).toEqual(["BABYDOGE"]);
}

describe("b69 build", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-fix-b77-2026-10-27");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-fix-b77-2026-10-27");
  });
});

describe("b69 TT b68 P2: /api/crypto has 400 unique coin ids", () => {
  it("MATIC is renamed to POL before the dedupe", () => {
    expect(renamedCoinSymbol("matic")).toBe("POL");
    expect(renamedCoinSymbol("BTC")).toBe("BTC");
  });

  it("keyless seed: dedupes by id after the rename and tops back up to 400 unique ids", () => {
    const { cg, backup, extra } = fixture();
    assertUnique400(mergeVerifiedSeedLists([cg, backup, extra]));
  });

  it("ranked merge: same 400 unique ids", () => {
    const { cg, backup, extra } = fixture();
    assertUnique400(mergeRankedCoins([cg, [...backup, ...extra]]));
  });

  it("retained depth rows never add a second row for an id", () => {
    const { cg } = fixture();
    const out = retainDepthCoins(cg, [coin("polygon-ecosystem-token", "MATIC", 192, "coinpaprika")]);
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
  });

  it("a non-CoinGecko row never takes a CoinGecko id from another symbol, even ranked higher", () => {
    const out = dedupeCoinsById([coin("the-open-network", "TON", 5, "coinpaprika"), coin("the-open-network", "GRAM", 21)]);
    expect(out.map((r) => r.symbol)).toEqual(["GRAM"]);
    const same = dedupeCoinsById([coin("x", "A", 50, "coinpaprika"), coin("x", "B", 10, "coinpaprika")]);
    expect(same.map((r) => r.symbol)).toEqual(["B"]);
  });

  it("the read path dedupes a snapshot saved before b69", () => {
    const src = read("src/lib/crypto-board-store.ts");
    expect(src).toMatch(/function gateCoins[\s\S]{0,400}dedupeCoinsById/);
  });
});

describe("b69 REG-1: a failed /_next/static chunk reloads the page once", () => {
  it("root layout loads the chunk-retry script before hydration", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('id="chunk-retry" strategy="beforeInteractive" nonce={nonce}');
    expect(CHUNK_RETRY_SNIPPET).toContain("/_next/static/");
    expect(CHUNK_RETRY_SNIPPET).toContain("ChunkLoadError");
    expect(CHUNK_RETRY_SNIPPET).toContain("sessionStorage");
  });

  it("reloads once per path inside 60 s, never loops", () => {
    let reloads = 0;
    const store: Record<string, string> = {};
    const listeners: Record<string, (e: unknown) => void> = {};
    const win = { addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; } };
    const loc = { pathname: "/tax", reload: () => { reloads++; } };
    const ss = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    new Function("window", "location", "sessionStorage", CHUNK_RETRY_SNIPPET)(win, loc, ss);
    const fail = { target: { tagName: "SCRIPT", src: "https://x/_next/static/chunks/8788.js" } };
    listeners.error(fail);
    listeners.error(fail);
    listeners.unhandledrejection({ reason: { name: "ChunkLoadError", message: "Loading chunk 8788 failed." } });
    expect(reloads).toBe(1);
    listeners.error({ target: { tagName: "IMG", src: "/_next/static/a.png" } });
    expect(reloads).toBe(1);
  });
});
