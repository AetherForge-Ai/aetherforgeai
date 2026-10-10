import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PUBLIC_COIN_ABOUT,
  PUBLIC_CRYPTO_SOURCE,
  PUBLIC_EQUITY_SOURCE,
  publicCoinDescription,
  publicCoinSourceLine,
  publicDataSourcesLine,
} from "./data-sources";

describe("public data-source copy", () => {
  afterEach(() => {
    delete process.env.SWYFTX_PUBLIC_DISPLAY;
  });

  it("names the sources the code calls and never prints an internal note", () => {
    delete process.env.SWYFTX_PUBLIC_DISPLAY;
    const copy = [publicDataSourcesLine(), publicCoinSourceLine("kraken"), publicCoinDescription(null)].join("\n");
    expect(copy).toContain(PUBLIC_EQUITY_SOURCE);
    expect(copy).toContain(PUBLIC_CRYPTO_SOURCE);
    expect(copy).toContain("Kraken");
    expect(copy).toContain("Coinbase");
    expect(copy).not.toMatch(/\bTODO\b/);
    expect(copy).not.toMatch(/fallback|unavailable/i);
    expect(copy).not.toMatch(/\b(Grok|ZENITH|ULTRA)\b/);
    expect(copy).not.toMatch(/licensed|GoGold/i);
    expect(copy).toMatch(/Yahoo Finance/);
    expect(copy).toMatch(/not a direct NZX or ASX feed/);
    expect(copy).not.toMatch(/Twelve Data|official|licensed|real-time/i);
    expect(copy).not.toMatch(/swyftx/i);
    expect(copy).toMatch(/gold-api\.com/);
    expect(PUBLIC_COIN_ABOUT).toMatch(/delayed|indicative/i);
    expect(PUBLIC_COIN_ABOUT).toMatch(/as-of/i);
    expect(PUBLIC_COIN_ABOUT).not.toMatch(/live|real-time/i);
    expect(readFileSync(path.join(process.cwd(), "src/lib/data-sources.ts"), "utf8")).toContain(
      "P2-POLISH-PULL-CHECK",
    );
  });

  it("replaces an internal fallback sentence", () => {
    expect(
      publicCoinDescription("BTC indicative USD quote via Yahoo Finance fallback (feed unavailable)."),
    ).toBe(PUBLIC_COIN_ABOUT);
  });

  it("uses the row source and hides Swyftx until the display flag is on", () => {
    delete process.env.SWYFTX_PUBLIC_DISPLAY;
    expect(publicCoinSourceLine("kraken")).toBe("Price source: Kraken. Quotes can be delayed.");
    expect(publicCoinSourceLine("swyftx")).not.toMatch(/swyftx/i);
    process.env.SWYFTX_PUBLIC_DISPLAY = "on";
    expect(publicDataSourcesLine()).toMatch(/Swyftx/);
    expect(publicCoinSourceLine("swyftx")).toBe("Price source: Swyftx. Quotes can be delayed.");
  });
});
