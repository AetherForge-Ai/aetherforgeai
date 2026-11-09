import { describe, expect, it } from "vitest";
import { formatMarketPrice } from "@/lib/market-intel";
import { watchlistShouldFetchQuote, watchlistShownPrint } from "@/lib/watchlist-print";

describe("watchlist shared quote", () => {
  it("shows the quote price and close label when intel has a different price", () => {
    const shown = watchlistShownPrint({
      itemName: "Fisher & Paykel",
      intel: { name: "Fisher & Paykel Healthcare", price: 11.11, currency: "NZD", change1d: 4.2 },
      quote: { price: 32.4, changePct: -0.5, currency: "NZD", label: "Close 16 Oct 2026" },
    });
    expect(shown.price).toBe(32.4);
    expect(shown.price).not.toBe(11.11);
    expect(shown.label).toBe("Close 16 Oct 2026");
    expect(shown.changePct).toBe(-0.5);
    expect(shown.currency).toBe("NZD");
    expect(formatMarketPrice(shown.price!, shown.currency!)).toBe(formatMarketPrice(32.4, "NZD"));
    expect(formatMarketPrice(shown.price!, shown.currency!)).not.toBe(formatMarketPrice(11.11, "NZD"));
    expect(watchlistShouldFetchQuote({ intelPrice: 11.11, haveQuote: false, asked: false })).toBe(true);
  });

  it("does not manufacture a price when the quote is absent", () => {
    const coin = watchlistShownPrint({
      itemName: "",
      intel: { name: "Solana", price: 208, currency: "USD", change1d: 3 },
      quote: null,
    });
    expect(coin.price).toBeNull();
    expect(coin.label).toBeNull();
    expect(coin.changePct).toBeNull();
    expect(coin.name).toBe("Solana");
    expect(watchlistShouldFetchQuote({ intelPrice: 208, haveQuote: false, asked: true })).toBe(false);
  });
});
