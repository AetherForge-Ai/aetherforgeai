import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ApexReport, ProjectionRow } from "@/lib/apex";
import {
  countLine,
  cryptoRowComplete,
  cryptoSnapshotComplete,
  dedupeDexByNetworkAddress,
  displayCoinName,
  koinsUnavailableLine,
  nameIsPublishable,
  pageRangeLine,
  pricesAsAtLabel,
  snapshotBlockchain,
  stripLastGoodCell,
  SNAPSHOT_COMPLETE_COUNT,
} from "@/lib/crypto-board";
import { coinDisplayName } from "@/lib/crypto-names";
import type { CoinMarket } from "@/lib/crypto-market";
import type { DexTokenRow } from "@/lib/crypto-dex";
import { applyKoinsSweeps, excludedFromKoinsSweep, type KoinsCandidate } from "@/lib/koins-quality";
import { confirmMapKey, confirmOnce, withIdempotencyNote } from "@/lib/confirm-once";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function coin(partial: Partial<CoinMarket> & Pick<CoinMarket, "symbol" | "name" | "price">): CoinMarket {
  return {
    id: partial.id || partial.symbol.toLowerCase(),
    image: "",
    rank: partial.rank ?? 1,
    marketCap: 1,
    fdv: null,
    volume24h: 1,
    change1h: null,
    change24h: 0,
    change7d: 0,
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
    blockchain: partial.blockchain || "Ethereum",
    ...partial,
  };
}

function dex(partial: Partial<DexTokenRow> & Pick<DexTokenRow, "symbol" | "network" | "address">): DexTokenRow {
  return {
    id: partial.id || partial.address || partial.symbol.toLowerCase(),
    name: partial.name || partial.symbol,
    price: partial.price ?? 1,
    priceUnavailable: false,
    volume24h: partial.volume24h ?? 1,
    dex: partial.dex || "Uniswap",
    detailId: partial.detailId ?? null,
    reserveUsd: partial.reserveUsd ?? 1,
    ...partial,
  };
}

function candidate(symbol: string, moves: KoinsCandidate["moves"], price = 1): KoinsCandidate {
  return { symbol, name: symbol, price, moves };
}

function report(projections: ProjectionRow[] = []): ApexReport {
  return {
    bot: "crypto",
    marketMovers: [
      {
        market: "CRYPTO",
        label: "Crypto",
        windows: [
          { window: "Last 24 hours", movers: [], withheldCount: 0, reviewNote: null },
          { window: "Last 7 days", movers: [], withheldCount: 0, reviewNote: null },
          { window: "Last month", movers: [], withheldCount: 0, reviewNote: null },
        ],
      },
    ],
    projectionLeaders: projections,
  } as ApexReport;
}

describe("U3 U7 V1 P1 snapshot", () => {
  it("pull-check:v3-tier1a-2026-10-12", () => {
    expect(read("src/lib/crypto-board.ts")).toContain("pull-check:v3-tier1a-2026-10-12");
    expect(read("src/lib/crypto-board-store.ts")).toContain("pull-check:v3-tier1a-2026-10-12");
    expect(read("src/app/api/cron/crypto-snapshot/route.ts")).toContain("No cron trigger is installed");
    expect(read("src/app/api/cron/crypto-snapshot/route.ts")).toContain("email: \"none\"");
    expect(read("wrangler.jsonc")).not.toContain("crons");
    expect(read("src/lib/crypto-source.ts")).toContain("readSharedCryptoBoard");
    expect(read("src/app/api/crypto/dex/route.ts")).toContain("readSharedDexBoard");
    expect(read("src/app/api/tickers/quote/route.ts")).toContain("priceFromSnapshot");
    expect(read("src/app/api/tickers/quote/route.ts")).toContain("listedCryptoIsStrict");
    expect(read("src/app/api/tickers/quote/route.ts")).toContain("pickListedCryptoPrice");
    expect(read("src/app/api/tickers/quote/route.ts")).toContain(
      "Live price was unavailable. A recent print is filled in ("
    );
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain(
      "Today's price is filled in. You can type over it."
    );
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain("idempotency_key");
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain("disabled={saving || !confirmReady}");
    expect(read("src/lib/transactions.ts")).toContain("rejectionChecked");
    expect(read("src/lib/transactions.ts")).toContain("scheduleSnapshotRevalue");
    expect(read("src/lib/transactions.ts")).toContain("[transactions] step");
    expect(read("src/lib/projection-pause.ts")).toContain("CRYPTO_PROJECTIONS_PAUSED = true");
    const explorer = read("src/components/dashboard/MarketsExplorer.tsx");
    expect(explorer).toContain("dexTabLabel");
    expect(explorer).toContain('isCryptoTab ? "Name" : "Company"');
    expect(explorer).toContain("formatUnitPrice");
    expect(explorer).not.toContain("fmtPrice");
  });

  it("names a coin, fills a native chain, and strips Last good from a cell", () => {
    expect(stripLastGoodCell("Last good · QI")).toBe("QI");
    expect(coinDisplayName("TRX", "TRX")).toBe("TRON");
    expect(coinDisplayName("INJ", "INJ")).toBe("Injective");
    expect(coinDisplayName("TIA", "")).toBe("Celestia");
    expect(coinDisplayName("ALGO", "ALGO")).toBe("Algorand");
    expect(coinDisplayName("XLM", "XLM")).toBe("Stellar");
    expect(coinDisplayName("BCH", "BCH")).toBe("Bitcoin Cash");
    expect(coinDisplayName("HBAR", "HBAR")).toBe("Hedera");
    expect(coinDisplayName("JTO", "JTO")).toBe("Jito");
    expect(coinDisplayName("SEI", "SEI")).toBe("Sei");
    expect(coinDisplayName("ONDO", "ONDO")).toBe("Ondo");
    expect(displayCoinName("BNB", "BNB")).toBe("BNB");
    expect(displayCoinName("XRP", "")).toBe("XRP");
    expect(displayCoinName("USDC", "USDC")).toBe("USDC");
    expect(nameIsPublishable("BNB", "BNB")).toBe(true);
    expect(nameIsPublishable("BTC", "BTC")).toBe(false);
    expect(snapshotBlockchain("bitcoin", {})).toBe("Bitcoin");
    expect(snapshotBlockchain("ethereum", null)).toBe("Ethereum");
    expect(snapshotBlockchain("solana", {})).toBe("Solana");
    expect(snapshotBlockchain("cardano", {})).toBe("Cardano");
    expect(snapshotBlockchain("ripple", {})).toBe("XRP Ledger");
    expect(snapshotBlockchain("usd-coin", {})).toBe("Ethereum");
    expect(snapshotBlockchain("pepe", { ethereum: "0xabc" })).toBe("Ethereum");
    expect(snapshotBlockchain("token", {}, "binance-smart-chain")).toBe("BNB Smart Chain");
    expect(cryptoRowComplete(coin({ symbol: "BTC", name: "Bitcoin", price: 1, blockchain: "Bitcoin" }))).toBe(true);
    expect(cryptoRowComplete(coin({ symbol: "BTC", name: "BTC", price: 1, blockchain: "Bitcoin" }))).toBe(false);
  });

  it("keeps one DEX row per network and address and one prices-as-at label", () => {
    const rows = dedupeDexByNetworkAddress([
      dex({ symbol: "Last good · QI", name: "Last good · Benqi", network: "Last good · Avalanche", address: "avax_0xqi", reserveUsd: 10, dex: "Trader Joe" }),
      dex({ symbol: "QI", name: "Benqi", network: "Avalanche", address: "avax_0xqi", reserveUsd: 50, dex: "Uniswap" }),
      dex({ symbol: "ALTAI", name: "Altai", network: "Ethereum", address: "eth_0xaltai", reserveUsd: 20, dex: "Uniswap" }),
      dex({ symbol: "ALTAI", name: "Altai", network: "Ethereum", address: "eth_0xaltai", reserveUsd: 5, dex: "Sushi" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => /last good/i.test(`${row.symbol} ${row.name} ${row.network} ${row.dex}`))).toBe(false);
    expect(rows.find((row) => row.symbol === "QI")?.reserveUsd).toBe(50);
    const fresh = "2026-10-12T03:05:00.000Z";
    const label = pricesAsAtLabel(fresh, Date.parse(fresh) + 60_000);
    expect(label).toBe("Prices as at 12 Oct 2026, 4:05 pm (NZ).");
    expect(label).not.toContain("Last good");
    const delayed = pricesAsAtLabel(fresh, Date.parse(fresh) + 31 * 60 * 1000);
    expect(delayed).toBe("Prices as at 12 Oct 2026, 4:05 pm (NZ). The feed is delayed.");
    expect(countLine("coins", 400)).toBe("400 coins");
    expect(countLine("DEX tokens", 400)).toBe("400 DEX tokens");
    expect(pageRangeLine(0, 25, 400)).toBe("Showing 1–25 of 400");
    expect(koinsUnavailableLine(fresh)).toBe(
      "Crypto market data is unavailable right now, so this list is not ranked. Last good snapshot: 12 Oct 2026, 4:05 pm."
    );
  });

  it("replaces a crypto list only when 95 percent of 400 rows are complete", () => {
    const good = Array.from({ length: SNAPSHOT_COMPLETE_COUNT }, (_, index) =>
      coin({ symbol: `C${index}`, name: `Coin ${index}`, price: index + 1, id: `coin-${index}`, blockchain: "Ethereum" })
    );
    expect(cryptoSnapshotComplete(good)).toBe(true);
    expect(cryptoSnapshotComplete(good.slice(0, SNAPSHOT_COMPLETE_COUNT - 1))).toBe(false);
  });

  it("ranks only positive Koins moves and keeps the section when the gate fails", () => {
    const fresh = "2026-10-12T03:05:00.000Z";
    const now = Date.parse(fresh) + 60_000;
    const rows = [
      candidate("AAA", { h24: 2, d7: 4, d30: 1 }),
      candidate("BBB", { h24: -3, d7: 1, d30: null }),
      candidate("CCC", { h24: null, d7: null, d30: 8 }),
      ...Array.from({ length: 8 }, (_, index) => candidate(`D${index}`, { h24: 0.2, d7: 0.4, d30: 0.5 })),
    ];
    const ranked = applyKoinsSweeps(report(), { at: fresh, candidates: rows, projections: [] }, now);
    const day = ranked.marketMovers[0].windows[0];
    expect(day.movers.every((row) => row.changePct > 0)).toBe(true);
    expect(day.movers.some((row) => row.ticker === "BBB")).toBe(false);
    expect(day.reviewNote).toContain("1 print under review");
    const week = ranked.marketMovers[0].windows[1];
    expect(week.reviewNote).toContain("1 print under review");
    expect(week.movers.every((row) => row.changePct > 0)).toBe(true);

    const stale = applyKoinsSweeps(report(), { at: fresh, candidates: rows, projections: [] }, Date.parse(fresh) + 61 * 60 * 1000);
    expect(stale.marketMovers[0].windows[0].movers).toEqual([]);
    expect(stale.marketMovers[0].windows[0].reviewNote).toBe(koinsUnavailableLine(fresh));
    expect(stale.marketMovers[0].windows[1].reviewNote || "").not.toContain("0 prints under review");
    expect(stale.koinsUnavailableNote).toBe(koinsUnavailableLine(fresh));

    const few = applyKoinsSweeps(
      report(),
      {
        at: fresh,
        candidates: [
          candidate("UP", { h24: 1, d7: 2, d30: 3 }),
          ...Array.from({ length: 12 }, (_, index) => candidate(`Z${index}`, { h24: -1, d7: -1, d30: -1 })),
        ],
        projections: [],
      },
      now
    );
    expect(few.marketMovers[0].windows[1].reviewNote).toContain("Only 1 coins gained over 7 days.");
    expect(few.marketMovers[0].windows[0].reviewNote).toContain("0 prints under review");

    expect(excludedFromKoinsSweep("USD0")).toBe(true);
    expect(excludedFromKoinsSweep("USX")).toBe(true);
    expect(excludedFromKoinsSweep("WEETH")).toBe(true);
    expect(excludedFromKoinsSweep("BTC.B")).toBe(true);
    expect(excludedFromKoinsSweep("EZETH")).toBe(true);
    expect(excludedFromKoinsSweep("CBBTC")).toBe(true);
    expect(excludedFromKoinsSweep("USDT")).toBe(true);

    const same: ProjectionRow = {
      ticker: "AAA",
      name: "Aaa",
      market: "CRYPTO",
      currency: "USD",
      price: 1,
      projected7dPct: 12,
      confidence: 40,
      signal: "Hold",
    };
    const uniform = applyKoinsSweeps(
      report([same, { ...same, ticker: "BBB" }, { ...same, ticker: "CCC" }]),
      { at: fresh, candidates: rows, projections: [same, { ...same, ticker: "BBB" }, { ...same, ticker: "CCC" }] },
      now
    );
    expect(uniform.projectionLeaders).toEqual([]);
    expect(uniform.koinsUnavailableNote).toBe(koinsUnavailableLine(fresh));
  });

  it("runs one Confirm for one idempotency key", async () => {
    expect(confirmMapKey("user", "abc")).toBe("user:abc");
    expect(confirmMapKey("user", "")).toBe("");
    expect(withIdempotencyNote("note", "abc")).toContain("idem=abc");
    let calls = 0;
    const key = `user:once-${Date.now()}`;
    const first = confirmOnce(key, async () => {
      calls += 1;
      return "row";
    });
    const second = confirmOnce(key, async () => {
      calls += 1;
      return "other";
    });
    await expect(Promise.all([first, second])).resolves.toEqual(["row", "row"]);
    expect(calls).toBe(1);
  });
});
