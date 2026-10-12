import { describe, expect, it } from "vitest";
import { displayLedgerNote } from "@/lib/dex-source";
import { DEX_REQUEST_FRESH_MS, pricesAsAtLabel, SNAPSHOT_REFRESH_MS } from "@/lib/crypto-board";
import { presentMarketCoin } from "@/lib/crypto-api-body";
import { mergeCoinMarketStats, type CoinMarket } from "@/lib/crypto-market";
import { coinDisplayName } from "@/lib/crypto-names";
import { cryptoFreshnessLabel } from "@/lib/market-freshness";
import { splitReturns } from "@/lib/returns-split";
import { sumRealisedFxNzd } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { csvNotes } from "@/lib/transaction-csv";

function coin(partial: Partial<CoinMarket> & Pick<CoinMarket, "symbol" | "name">): CoinMarket {
  return {
    id: partial.id || partial.symbol.toLowerCase(),
    symbol: partial.symbol,
    name: partial.name,
    image: "",
    rank: 1,
    price: 1,
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
    ...partial,
  };
}

describe("retest 11 currency effect", () => {
  it("adds realised MSFT FX and cost-based unrealised FX", () => {
    const rows: TaxLedgerRow[] = [
      {
        type: "buy",
        ticker: "MSFT",
        asset_type: "stock",
        executed_at: "2026-01-15",
        quantity: 1,
        price: 420,
        currency: "USD",
        fx_rate: 1.716,
      },
      {
        type: "sell",
        ticker: "MSFT",
        asset_type: "stock",
        executed_at: "2026-06-15",
        quantity: 1,
        price: 430,
        currency: "USD",
        fx_rate: 1.7511,
      },
    ];
    const realised = sumRealisedFxNzd(rows);
    expect(realised).toBeCloseTo(1 * 420 * (1.7511 - 1.716), 6);

    const split = splitReturns(
      [
        {
          quantity: 1,
          costPrice: 100,
          markPrice: 110,
          currency: "USD",
          fxAtCost: 1.65,
          costBasisFx: 1.65,
          fxNow: 1.7,
          purchaseDate: "2020-01-15",
        },
      ],
      0,
      null,
      {
        realisedFxNzd: realised,
        foreignCash: [{ amount: 100, currency: "USD", fxBook: 1.6, fxNow: 1.7 }],
      }
    );
    // Open lot: unrealised FX = 1 × 100 × (1.7 − 1.65) = 5. Capital = (110 − 100) × 1.7 = 17.
    // Foreign cash: 100 × (1.7 − 1.6) = 10. Realised MSFT FX = 14.742.
    expect(split.capitalGainNzd).toBe(17);
    expect(split.currencyEffectNzd).toBeCloseTo(5 + 10 + 14.742, 2);
    expect(split.otherNzd).toBe(0);
  });
});

describe("retest 11 ledger text and names", () => {
  it("hides stamps on screen and keeps chain= and pxat= in the CSV", () => {
    const notes = "Bought chain=Ethereum pxat=2026-10-13T01:02:03.000Z live=n/a idem=abc [audit 13/10/2026, 1:02 pm]";
    expect(displayLedgerNote(notes)).toBe("Bought");
    expect(displayLedgerNote(notes)).not.toMatch(/live|chain=|pxat=/);
    const exported = csvNotes({ type: "buy", notes, currency: "USD" });
    expect(exported).toContain("chain=Ethereum");
    expect(exported).toContain("pxat=2026-10-13T01:02:03.000Z");
    expect(exported).toContain("live=n/a");
  });

  it("uses the feed name and shows DYDX as dYdX", () => {
    expect(coinDisplayName("DYDX", "DYDX")).toBe("dYdX");
    expect(coinDisplayName("BTC", "Bitcoin")).toBe("Bitcoin");
    const merged = mergeCoinMarketStats(
      coin({ symbol: "RENDER", name: "RENDER" }),
      coin({ symbol: "RENDER", name: "Render", blockchain: "Solana" })
    );
    expect(merged.name).toBe("Render");
    expect(merged.blockchain).toBe("Solana");
    const blank = presentMarketCoin(coin({ symbol: "ZZZTEST", name: "ZZZTEST", source: "coinpaprika", blockchain: "" }));
    expect(blank.blockchain).toBe("");
    expect(blank.blockchainReason).toBe("CoinPaprika did not send a platform for this coin.");
  });
});

describe("retest 11 clocks and DEX freshness", () => {
  it("prints a fixed zone word and refreshes DEX prices inside five minutes", () => {
    const now = new Date("2026-10-07T06:43:00.000Z");
    const fresh = cryptoFreshnessLabel(new Date(now.getTime() - 60_000), now);
    expect(fresh.label).toBe("Live · crypto · updated 7:42 pm NZ");
    expect(SNAPSHOT_REFRESH_MS).toBe(10 * 60 * 1000);
    expect(DEX_REQUEST_FRESH_MS).toBe(5 * 60 * 1000);
    const at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    expect(pricesAsAtLabel(at, Date.now(), DEX_REQUEST_FRESH_MS)).toMatch(/The feed is delayed/);
    expect(pricesAsAtLabel(at, Date.now())).not.toMatch(/The feed is delayed/);
  });
});
