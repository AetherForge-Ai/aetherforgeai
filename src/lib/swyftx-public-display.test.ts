import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { CryptoPriceBook, formatPublicCryptoPrice, sourceLabel } from "@/lib/crypto-price-chain";
import { PUBLIC_COIN_ABOUT, publicCoinSourceLine, publicDataSourcesLine } from "@/lib/data-sources";
import { PROCESSORS } from "@/lib/public-copy";
import { gatePublicPrint, swyftxPublicDisplay } from "@/lib/swyftx-display";

const QUOTED_AT = "2026-10-10T01:00:00.000Z";

describe("SWYFTX_PUBLIC_DISPLAY", () => {
  afterEach(() => {
    delete process.env.SWYFTX_PUBLIC_DISPLAY;
  });

  it("keeps Swyftx out of public responses while the flag is off", async () => {
    delete process.env.SWYFTX_PUBLIC_DISPLAY;
    expect(swyftxPublicDisplay()).toBe(false);
    let swyftxCalls = 0;
    const book = new CryptoPriceBook(
      [
        {
          id: "coingecko",
          quote: async () => {
            throw new Error("down");
          },
        },
        {
          id: "swyftx",
          available: () => swyftxPublicDisplay(),
          quote: async () => {
            swyftxCalls += 1;
            return { price: 50, source: "swyftx", quotedAt: QUOTED_AT };
          },
        },
        {
          id: "kraken",
          quote: async () => ({ price: 100, source: "kraken", quotedAt: QUOTED_AT }),
        },
      ],
      { now: () => Date.parse(QUOTED_AT), timeoutMs: 200 }
    );
    const print = await book.quote("BTC");
    expect(swyftxCalls).toBe(0);
    expect(print?.source).toBe("kraken");
    const payload = {
      ok: true,
      data: print && {
        symbol: print.symbol,
        price: print.price,
        source: sourceLabel(print.source),
        label: formatPublicCryptoPrice(print),
        quotedAt: print.quotedAt,
      },
      sources: publicDataSourcesLine(),
      processors: PROCESSORS().map((processor) => `${processor.name} ${processor.role}`),
      coinLine: publicCoinSourceLine(print?.source),
      hiddenLine: publicCoinSourceLine("swyftx"),
      about: PUBLIC_COIN_ABOUT,
      gated: gatePublicPrint({ source: "swyftx", price: 50, symbol: "BTC" }),
      marketsLede:
        "Coins by market cap, in USD. The line under the search is how many this list returned, up to 400.",
    };
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("swyftx");
    expect(readFileSync("src/components/dashboard/MarketsPageContent.tsx", "utf8").toLowerCase()).not.toContain("swyftx");
    expect(readFileSync("src/app/api/crypto/price/route.ts", "utf8")).not.toContain("fetchSpotPrices");
    expect(payload.gated).toBeNull();
    expect(publicCoinSourceLine("kraken")).toBe("Price source: Kraken. Quotes can be delayed.");
    expect(PUBLIC_COIN_ABOUT).toMatch(/delayed|indicative/i);
    expect(PUBLIC_COIN_ABOUT).toMatch(/as-of/i);
    expect(PUBLIC_COIN_ABOUT).not.toMatch(/\blive\b|real-time/i);
  });

  it("names Swyftx in public copy only after the flag is turned on", () => {
    process.env.SWYFTX_PUBLIC_DISPLAY = "on";
    expect(swyftxPublicDisplay()).toBe(true);
    expect(publicDataSourcesLine()).toMatch(/Swyftx/);
    expect(PROCESSORS().some((processor) => processor.name === "Swyftx")).toBe(true);
    expect(publicCoinSourceLine("swyftx")).toMatch(/Swyftx/);
    expect(gatePublicPrint({ source: "swyftx", price: 50 })?.price).toBe(50);
  });
});
