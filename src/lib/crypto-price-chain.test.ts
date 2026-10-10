import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicCryptoPrices } from "@/components/markets/PublicCryptoPrices";
import {
  CHAIN_BACKOFF_MS,
  CHAIN_FAILURES_BEFORE_OPEN,
  CryptoPriceBook,
  DEX_PROVIDER_ORDER,
  SPOT_PROVIDER_ORDER,
  choosePublicPriceTab,
  formatPublicCryptoPrice,
  publicCryptoPriceText,
  type ChainPrint,
  type ChainProvider,
} from "@/lib/crypto-price-chain";
import { CRYPTO_SANITY_RATIO } from "@/lib/crypto-tape";

const QUOTED_AT = "2026-10-10T01:00:00.000Z";
const NOW = Date.parse(QUOTED_AT);

function print(partial: Partial<ChainPrint> & Pick<ChainPrint, "symbol" | "price" | "source">): ChainPrint {
  return {
    changePct: 1,
    quotedAt: QUOTED_AT,
    stale: false,
    storedAt: NOW,
    ...partial,
  };
}

function provider(id: string, impl: ChainProvider["quote"], dexOnly = false): ChainProvider {
  return { id, dexOnly, quote: impl };
}

describe("crypto price chain", () => {
  it("keeps the sanity ratio at 3 and the documented provider order", () => {
    expect(CRYPTO_SANITY_RATIO).toBe(3);
    expect(SPOT_PROVIDER_ORDER).toEqual(["coingecko", "swyftx", "kraken", "coinbase", "yahoo"]);
    expect(DEX_PROVIDER_ORDER[0]).toBe("geckoterminal");
    expect(CHAIN_FAILURES_BEFORE_OPEN).toBe(2);
    expect(CHAIN_BACKOFF_MS).toBe(60_000);
    const source = readFileSync("src/lib/crypto-price-chain.ts", "utf8");
    expect(source).toContain("pull-check:crypto-dex-400-2026-10-11");
  });

  it("uses the next provider when one source fails", async () => {
    for (const id of SPOT_PROVIDER_ORDER) {
      const providers = SPOT_PROVIDER_ORDER.map((name) =>
        provider(name, async () => {
          if (name !== id) throw new Error(`${name} down`);
          return { price: 100, quotedAt: QUOTED_AT };
        })
      );
      const book = new CryptoPriceBook(providers, { now: () => NOW, timeoutMs: 200 });
      const result = await book.quote("BTC");
      expect(result?.source).toBe(id);
      expect(result?.price).toBe(100);
      expect(result?.stale).toBe(false);
    }
  });

  it("asks GeckoTerminal first for a DEX quote", async () => {
    const seen: string[] = [];
    const providers = [
      provider("coingecko", async () => {
        seen.push("coingecko");
        return { price: 4, quotedAt: QUOTED_AT };
      }),
      provider(
        "geckoterminal",
        async () => {
          seen.push("geckoterminal");
          return { price: 4, quotedAt: QUOTED_AT };
        },
        true
      ),
    ];
    const book = new CryptoPriceBook(providers, { now: () => NOW, timeoutMs: 200 });
    const result = await book.quote("PEPE", { dex: true });
    expect(seen[0]).toBe("geckoterminal");
    expect(result?.source).toBe("geckoterminal");
    expect(result?.price).toBe(4);
  });

  it("drops a print that fails the sanity check and keeps the agreeing source", async () => {
    const book = new CryptoPriceBook(
      [
        provider("coingecko", async () => ({ price: 1_000, quotedAt: QUOTED_AT })),
        provider("swyftx", async () => ({ price: 110, quotedAt: QUOTED_AT })),
      ],
      { now: () => NOW, timeoutMs: 200 }
    );
    book.remember(print({ symbol: "BTC", price: 100, source: "coingecko" }));
    const result = await book.quote("BTC");
    expect(result?.price).toBe(110);
    expect(result?.source).toBe("swyftx");
    expect(result?.stale).toBe(false);
    expect(formatPublicCryptoPrice(result!)).not.toContain("1,000");
  });

  it("opens the circuit after repeated failures", async () => {
    let calls = 0;
    const book = new CryptoPriceBook(
      [
        provider("coingecko", async () => {
          calls += 1;
          throw new Error("down");
        }),
        provider("swyftx", async () => ({ price: 50, quotedAt: QUOTED_AT })),
      ],
      { now: () => NOW, timeoutMs: 200, failuresBeforeOpen: 2, backoffMs: 60_000 }
    );
    await book.quote("BTC");
    await book.quote("ETH");
    expect(calls).toBe(2);
    await book.quote("SOL", { now: NOW + 1_000 });
    expect(calls).toBe(2);
    await book.quote("SOL", { now: NOW + 60_000 + 1 });
    expect(calls).toBe(3);
  });

  it("shows the labelled last good price when every provider fails", async () => {
    const providers = SPOT_PROVIDER_ORDER.map((id) =>
      provider(id, async () => {
        throw new Error(`${id} down`);
      })
    );
    const book = new CryptoPriceBook(providers, { now: () => NOW, timeoutMs: 50 });
    book.remember(print({ symbol: "BTC", price: 100, source: "coingecko" }));
    const result = await book.quote("BTC");
    expect(result?.stale).toBe(true);
    expect(result?.price).toBe(100);
    expect(result?.source).toBe("coingecko");

    const html = renderToStaticMarkup(createElement(PublicCryptoPrices, { prints: [result!] }));
    const text = publicCryptoPriceText([result!]);
    expect(text).toContain("BTC");
    expect(text).toContain("US$100.00");
    expect(text).toContain("as of");
    expect(text).toContain("Oct 2026");
    expect(text).toContain("CoinGecko");
    expect(text).toContain("last good price");
    expect(html).toContain(text);
    expect(html).toContain("data-ticker-quote");
    expect(html.toLowerCase()).not.toContain("loading");
    expect(html).not.toContain("US$0.00");
    expect(html).not.toContain("Price not in this response");
    expect(text.trim().length).toBeGreaterThan(0);

    const page = readFileSync("src/app/markets/crypto/[id]/page.tsx", "utf8");
    const tables = readFileSync("src/components/markets/PublicMarketTables.tsx", "utf8");
    const index = readFileSync("src/lib/public-market-index.ts", "utf8");
    expect(page).toContain("PublicCryptoPrices");
    expect(page).not.toContain("Price not in this response");
    expect(tables).toContain("publicCryptoTableLines");
    expect(tables).toContain("No earlier price is stored.");
    expect(index).toContain("choosePublicPriceTab");
  });

  it("republishes the last good market rows and drops a zero price", () => {
    const fresh = {
      id: "CRYPTO",
      title: "Crypto",
      asOf: "as of not stated by the vendor",
      rows: [],
    };
    const last = {
      id: "CRYPTO",
      title: "Crypto",
      asOf: "as of 10 Oct 2026, 2:00 pm",
      rows: [
        { symbol: "BTC", name: "Bitcoin", price: "US$100.00", change: "+1.00%", href: "/markets/crypto/bitcoin", usd: 100 },
        { symbol: "ZERO", name: "Zero", price: "US$0.00", change: "0%", href: "/markets/crypto/zero", usd: 0 },
      ],
    };
    const tab = choosePublicPriceTab(fresh, last);
    expect(tab.rows.map((row) => row.symbol)).toEqual(["BTC"]);
    expect(tab.asOf).toContain("as of");
    expect(tab.asOf).toContain("last good price");
    expect(publicCryptoPriceText([])).toBe("");
  });
});
