import { describe, expect, it } from "vitest";
import { isExchangeRegularSession } from "@/lib/market-intel";
import {
  CRYPTO_LIVE_POLL_MS,
  applyCryptoPollSuccess,
  applyLiveCryptoPrices,
  evaluateCryptoAlert,
  formatAucklandHms,
  normalizeCryptoSymbols,
  shouldFetchCryptoPoll,
  stampCryptoQuoteLive,
  unrealisedPctVsPurchase,
} from "@/lib/crypto-live";

describe("crypto live clock", () => {
  it("formats Pacific/Auckland as HH:MM:SS in standard time", () => {
    // 15 Jul 2026 is NZST (UTC+12).
    expect(formatAucklandHms(new Date("2026-07-15T02:03:04.000Z"))).toBe("14:03:04");
  });

  it("formats Pacific/Auckland as HH:MM:SS in daylight time", () => {
    // 15 Jan 2026 is NZDT (UTC+13).
    expect(formatAucklandHms(new Date("2026-01-15T02:03:04.000Z"))).toBe("15:03:04");
  });

  it("advances the displayed clock on each successful poll", () => {
    const firstAt = Date.parse("2026-07-18T10:00:00.000Z"); // Saturday
    const secondAt = firstAt + CRYPTO_LIVE_POLL_MS;
    let state = applyCryptoPollSuccess({ quotes: {}, updatedAt: null }, { BTC: { price: 64000, changePct: 0.2 } }, firstAt);
    const firstLabel = formatAucklandHms(new Date(state.updatedAt!));
    state = applyCryptoPollSuccess(state, { BTC: { price: 64110, changePct: 0.4 } }, secondAt);
    const secondLabel = formatAucklandHms(new Date(state.updatedAt!));
    expect(secondLabel).not.toBe(firstLabel);
    expect(state.quotes.BTC.price).toBe(64110);
    expect(isExchangeRegularSession("NZX", new Date(secondAt))).toBe(false);
    expect(isExchangeRegularSession("ASX", new Date(secondAt))).toBe(false);
    expect(isExchangeRegularSession("NASDAQ", new Date(secondAt))).toBe(false);
  });
});

describe("crypto quote session gating", () => {
  it("keeps a price an equity feed marked close and labels it live", () => {
    const stamped = stampCryptoQuoteLive({ price: 182.4, changePct: 1.2, asOf: "close" as const });
    expect(stamped.asOf).toBe("live");
    expect(stamped.price).toBe(182.4);
  });

  it("batches symbols and drops equity tickers", () => {
    expect(normalizeCryptoSymbols([" eth ", "BTC", "btc", "BHP.AX", "SOL-USD", "", "AIR.NZ"])).toEqual([
      "BTC",
      "ETH",
      "SOL",
    ]);
  });

  it("does not poll while the tab is hidden or Buy/Add is open", () => {
    expect(shouldFetchCryptoPoll({ hidden: true, dialogOpen: false, hasSymbols: true })).toBe(false);
    expect(shouldFetchCryptoPoll({ hidden: false, dialogOpen: true, hasSymbols: true })).toBe(false);
    expect(shouldFetchCryptoPoll({ hidden: false, dialogOpen: false, hasSymbols: true })).toBe(true);
    expect(shouldFetchCryptoPoll({ hidden: false, dialogOpen: false, hasSymbols: false })).toBe(false);
  });
});

describe("crypto unrealised P/L and alerts", () => {
  it("measures P/L against purchase and does not add a second 1% fee", () => {
    // Stored average already includes the ~1% buy fee (100 * 1.01).
    const purchase = 101;
    expect(unrealisedPctVsPurchase(purchase, 101)).toBeCloseTo(0, 8);
    const pct = unrealisedPctVsPurchase(purchase, 97.97);
    expect(pct).toBeCloseTo(-3, 1);
  });

  it("sells at the configured loss vs purchase (−3%), including when cash markets are shut", () => {
    const sunday = new Date("2026-07-19T01:00:00.000Z");
    expect(isExchangeRegularSession("NZX", sunday)).toBe(false);
    const ev = evaluateCryptoAlert({
      purchasePrice: 100,
      currentPrice: 97,
      trimTriggerDipPct: 3,
      hardSellPrice: null,
      takeProfitMinPct: 8,
      takeProfitMaxPct: 12,
    });
    expect(ev.pnlPct).toBeCloseTo(-3, 8);
    expect(ev.sell).toBe(true);
    expect(ev.trimming).toBe(false);
  });

  it("does not rewrite a different configured loss threshold to −3%", () => {
    const ev = evaluateCryptoAlert({
      purchasePrice: 100,
      currentPrice: 95,
      trimTriggerDipPct: 6,
      takeProfitMinPct: 12,
      takeProfitMaxPct: 15,
    });
    expect(ev.sell).toBe(false);
    expect(
      evaluateCryptoAlert({
        purchasePrice: 100,
        currentPrice: 94,
        trimTriggerDipPct: 6,
      }).sell
    ).toBe(true);
  });

  it("starts trimming at the configured gain band (+8–12%) and not before", () => {
    const below = evaluateCryptoAlert({
      purchasePrice: 200,
      currentPrice: 215,
      trimTriggerDipPct: 3,
      takeProfitMinPct: 8,
      takeProfitMaxPct: 12,
    });
    expect(below.pnlPct).toBeCloseTo(7.5, 8);
    expect(below.trimming).toBe(false);
    expect(below.sell).toBe(false);

    const inBand = evaluateCryptoAlert({
      purchasePrice: 200,
      currentPrice: 220,
      trimTriggerDipPct: 3,
      takeProfitMinPct: 8,
      takeProfitMaxPct: 12,
    });
    expect(inBand.pnlPct).toBeCloseTo(10, 8);
    expect(inBand.trimming).toBe(true);
    expect(inBand.sell).toBe(false);
  });

  it("still honours an absolute hard sell when no percent loss is set", () => {
    const ev = evaluateCryptoAlert({
      purchasePrice: 100,
      currentPrice: 90,
      trimTriggerDipPct: null,
      hardSellPrice: 90,
      takeProfitMinPct: 8,
      takeProfitMaxPct: 12,
    });
    expect(ev.sell).toBe(true);
  });

  it("overlays live marks without zeroing a coin the snapshot missed, and leaves stocks alone", () => {
    const rows = [
      { ticker: "BTC", asset_type: "crypto" as const, current_price: 64000 },
      { ticker: "ETH", asset_type: "crypto" as const, current_price: 3200 },
      { ticker: "BHP.AX", asset_type: "stock" as const, current_price: 40 },
    ];
    const next = applyLiveCryptoPrices(rows, { BTC: { price: 65000 } });
    expect(next[0].current_price).toBe(65000);
    expect(next[1].current_price).toBe(3200);
    expect(next[2].current_price).toBe(40);
    expect(applyLiveCryptoPrices(rows, {})).toBe(rows);
  });
});
