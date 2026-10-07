import { describe, expect, it } from "vitest";
import {
  PUBLIC_COIN_SOURCE_LINE,
  PUBLIC_CRYPTO_SOURCE,
  PUBLIC_DATA_SOURCES_LINE,
  PUBLIC_EQUITY_SOURCE,
  publicCoinDescription,
} from "./data-sources";

describe("public data-source copy", () => {
  it("names the same sources and never prints an internal note", () => {
    const copy = [PUBLIC_DATA_SOURCES_LINE, PUBLIC_COIN_SOURCE_LINE, publicCoinDescription(null)].join("\n");
    expect(copy).toContain(PUBLIC_EQUITY_SOURCE);
    expect(copy).toContain(PUBLIC_CRYPTO_SOURCE);
    expect(copy).not.toMatch(/\bTODO\b/);
    expect(copy).not.toMatch(/fallback|unavailable/i);
    expect(copy).not.toMatch(/\b(Grok|ZENITH|ULTRA)\b/);
    expect(copy).not.toMatch(/licensed|GoGold/i);
    expect(copy).toMatch(/Yahoo Finance/);
    expect(copy).toMatch(/not a direct NZX or ASX feed/);
    expect(copy).toMatch(/Twelve Data/);
    expect(copy).toMatch(/Swyftx/);
    expect(copy).toMatch(/gold-api\.com/);
  });

  it("replaces an internal fallback sentence", () => {
    expect(
      publicCoinDescription("BTC live USD quote via Yahoo Finance fallback (Swyftx/CoinGecko unavailable)."),
    ).toBe(`Live USD quote from ${PUBLIC_CRYPTO_SOURCE}.`);
  });
});
