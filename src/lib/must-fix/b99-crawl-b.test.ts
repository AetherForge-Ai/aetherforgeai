/**
 * CRAWL-B (11 Nov 2026): unknown coin slugs 404, alias slugs share one URL, NZ$ leads the description.
 * A known coin still renders when the price API is down. An empty CoinGecko list is a real miss.
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const snapshot = vi.hoisted(() => ({ read: vi.fn(async () => null as { coins?: Array<{ id: string; symbol: string }> } | null) }));

vi.mock("@/lib/crypto-snapshot", () => ({
  readCryptoSnapshot: () => snapshot.read(),
}));

vi.mock("@/lib/crypto-coingecko", () => ({
  peekTop400: () => null,
}));

import { middleware } from "../../middleware";
import { cryptoDetailCopy } from "@/lib/crypto-public-meta";
import { savedCoinSlug } from "@/lib/crypto-depth.server";
import { cryptoDetailHref } from "@/lib/market-detail-routes";
import { paperAddReturnPath } from "@/lib/paper-add-link";
import { permanentRedirect } from "@/lib/public-route-aliases";
import { publicTickerPaths } from "@/lib/sitemap-tickers";
import { resolvePublicCoin } from "@/lib/crypto-coin-page.server";
import {
  classifyGeckoMarkets,
  coinPageRedirects,
  coinSlugRedirect,
  decideCoinPage,
  publicCoinSlug,
} from "@/lib/crypto-slug";

const read = (path: string) => readFileSync(path, "utf8");

/** Workers Cache API stand-in so a settled probe can be replayed without another fetch. */
const probeStore = new Map<string, { expires: number; body: string }>();
const previousCaches = (globalThis as { caches?: unknown }).caches;
(globalThis as { caches?: { open: (name: string) => Promise<unknown> } }).caches = {
  open: async () => ({
    async match(request: Request) {
      const hit = probeStore.get(request.url);
      if (!hit || hit.expires <= Date.now()) return undefined;
      return new Response(hit.body, {
        headers: { "content-type": "application/json", expires: new Date(hit.expires).toUTCString() },
      });
    },
    async put(request: Request, response: Response) {
      const expires = Date.parse(response.headers.get("expires") || "");
      probeStore.set(request.url, { expires, body: await response.text() });
    },
  }),
};
afterAll(() => {
  (globalThis as { caches?: unknown }).caches = previousCaches;
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  };
}

describe("F3 unknown coin vs price outage", () => {
  it("an empty CoinGecko list is a 404 only when Paprika is empty too, and a known coin still renders when the API is down", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("coinpaprika")) return jsonResponse(404, { error: "id not found" });
      return jsonResponse(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);
    snapshot.read.mockResolvedValue(null);

    await expect(resolvePublicCoin("not-a-coin-qa")).resolves.toEqual({ action: "not-found" });
    expect(fetchMock).toHaveBeenCalled();

    fetchMock.mockResolvedValue(jsonResponse(200, [{ id: "gecko-listed-coin", current_price: null }]));
    await expect(resolvePublicCoin("gecko-listed-coin")).resolves.toEqual({ action: "render", canonical: "gecko-listed-coin" });

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("coinpaprika")) return jsonResponse(200, { id: "btc-bitcoin", symbol: "BTC", name: "Bitcoin" });
      return jsonResponse(200, []);
    });
    await expect(resolvePublicCoin("btc-bitcoin")).resolves.toEqual({ action: "render", canonical: "btc-bitcoin" });

    fetchMock.mockResolvedValue(jsonResponse(404, { error: "missing" }));
    await expect(resolvePublicCoin("gecko-404-coin")).resolves.toEqual({ action: "not-found" });

    fetchMock.mockRejectedValue(new Error("coingecko timeout"));
    await expect(resolvePublicCoin("bitcoin")).resolves.toEqual({ action: "render", canonical: "bitcoin" });
    await expect(resolvePublicCoin("timeout-real-coin")).resolves.toEqual({ action: "not-found" });

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(503, { error: "down" }));
    snapshot.read.mockResolvedValue({ coins: [{ id: "snapshot-hit-coin", symbol: "SOC" }] });
    await expect(resolvePublicCoin("snapshot-hit-coin")).resolves.toEqual({ action: "render", canonical: "snapshot-hit-coin" });
    expect(fetchMock).not.toHaveBeenCalled();

    snapshot.read.mockResolvedValue({ coins: [{ id: "imposter-xlm", symbol: "XLM" }] });
    expect(await savedCoinSlug("stellar")).toBeNull();
    await expect(resolvePublicCoin("stellar")).resolves.toEqual({ action: "render", canonical: "stellar" });

    snapshot.read.mockImplementation(() => new Promise(() => {}));
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(429, []));
    await expect(resolvePublicCoin("cold-outage-coin")).resolves.toEqual({ action: "not-found" });

    const page = read("src/app/markets/crypto/[id]/page.tsx");
    expect(page).toContain('if (decision.action === "not-found") notFound()');
    expect(page).toContain("resolvePublicCoin");
  }, 10_000);

  it("404s an unknown slug when CoinGecko is blocked, and still renders a known coin", async () => {
    snapshot.read.mockResolvedValue(null);
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("coinpaprika")) return jsonResponse(404, { error: "id not found" });
      return jsonResponse(429, []);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolvePublicCoin("blocked-not-a-coin")).resolves.toEqual({ action: "not-found" });
    await expect(resolvePublicCoin("bitcoin")).resolves.toEqual({ action: "render", canonical: "bitcoin" });
    await expect(resolvePublicCoin("near-protocol")).resolves.toEqual({
      action: "redirect",
      to: "/markets/crypto/near",
    });

    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("coingecko")) return jsonResponse(429, []);
      throw new Error("paprika timeout");
    });
    fetchMock.mockClear();
    await expect(resolvePublicCoin("rate-limited-unknown")).resolves.toEqual({ action: "not-found" });
    const callsAfterTimeout = fetchMock.mock.calls.length;
    expect(callsAfterTimeout).toBeGreaterThan(0);
    await expect(resolvePublicCoin("rate-limited-unknown")).resolves.toEqual({ action: "not-found" });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterTimeout);

    const alias = await middleware(new NextRequest("https://aetherforgeai.co.nz/markets/crypto/near-protocol"));
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe("https://aetherforgeai.co.nz/markets/crypto/near");
  });

  it("404s when Paprika is down, 404s an empty search, and caches only a settled miss", async () => {
    snapshot.read.mockResolvedValue(null);
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("coinpaprika")) return jsonResponse(503, { error: "down" });
      return jsonResponse(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolvePublicCoin("gecko-empty-paprika-down")).resolves.toEqual({ action: "not-found" });
    const callsAfterDown = fetchMock.mock.calls.length;
    expect(callsAfterDown).toBeGreaterThan(0);
    await expect(resolvePublicCoin("gecko-empty-paprika-down")).resolves.toEqual({ action: "not-found" });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterDown);

    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/v1/search/")) return jsonResponse(200, { currencies: [] });
      if (u.includes("coinpaprika")) return jsonResponse(404, { error: "id not found" });
      return jsonResponse(200, []);
    });
    await expect(resolvePublicCoin("empty-search-coin")).resolves.toEqual({ action: "not-found" });

    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/v1/search/")) {
        return jsonResponse(200, {
          currencies: [
            { id: "near-near-protocol", symbol: "NEAR" },
            { id: "rain-rain-protocol", symbol: "RAIN" },
          ],
        });
      }
      if (u.includes("coinpaprika")) return jsonResponse(404, { error: "id not found" });
      return jsonResponse(200, []);
    });
    await expect(resolvePublicCoin("protocol")).resolves.toEqual({ action: "not-found" });

    fetchMock.mockClear();
    await expect(resolvePublicCoin("protocol")).resolves.toEqual({ action: "not-found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies a finished lookup separately from an outage", () => {
    expect(classifyGeckoMarkets(200, [], "not-a-coin-qa")).toBe("empty");
    expect(classifyGeckoMarkets(404, { error: "missing" }, "not-a-coin-qa")).toBe("down");
    expect(classifyGeckoMarkets(200, [{ id: "bitcoin", current_price: null }], "bitcoin")).toBe("asset");
    expect(classifyGeckoMarkets(200, [{ id: "ethereum" }], "bitcoin")).toBe("empty");
    expect(classifyGeckoMarkets(429, [], "bitcoin")).toBe("down");
    expect(classifyGeckoMarkets(200, { status: "error" }, "bitcoin")).toBe("down");

    expect(decideCoinPage({ slug: "not-a-coin-qa", knownCanonical: null, upstream: "empty" })).toEqual({ action: "not-found" });
    expect(decideCoinPage({ slug: "bitcoin", knownCanonical: "bitcoin", upstream: "down" })).toEqual({
      action: "render",
      canonical: "bitcoin",
    });
    expect(decideCoinPage({ slug: "bitcoin", knownCanonical: "bitcoin", upstream: "empty" })).toEqual({
      action: "render",
      canonical: "bitcoin",
    });
    expect(decideCoinPage({ slug: "eth_0xabc", knownCanonical: null, upstream: "empty" })).toEqual({
      action: "render",
      canonical: "",
    });
  });
});

describe("F4 one canonical slug per coin", () => {
  it("308s every alias, including NEAR and the other provider ids, and links use that slug", async () => {
    const redirects = coinPageRedirects();
    expect(redirects.length).toBeGreaterThan(1);
    expect(redirects).toContainEqual({ source: "/markets/crypto/near-protocol", destination: "/markets/crypto/near" });
    expect(redirects).toContainEqual({ source: "/markets/crypto/near-near-protocol", destination: "/markets/crypto/near" });
    expect(redirects).toContainEqual({ source: "/markets/crypto/usdt-tether", destination: "/markets/crypto/tether" });
    expect(redirects).toContainEqual({ source: "/markets/crypto/xlm-stellar", destination: "/markets/crypto/stellar" });
    expect(redirects).toContainEqual({ source: "/markets/crypto/rain-rain-protocol", destination: "/markets/crypto/rain-protocol" });

    for (const row of redirects) {
      expect(row.source).not.toBe(row.destination);
      expect(coinSlugRedirect(row.source)).toBe(row.destination);
      expect(coinSlugRedirect(`${row.source}/`)).toBe(row.destination);
      expect(coinSlugRedirect(row.destination)).toBeNull();
      const alias = row.source.replace("/markets/crypto/", "");
      expect(cryptoDetailHref(alias)).toBe(row.destination);
      expect(publicCoinSlug(alias)).toBe(row.destination.replace("/markets/crypto/", ""));
      expect(publicTickerPaths()).not.toContain(row.source);
    }
    const tickers = publicTickerPaths();
    expect(tickers).toContain("/markets/crypto/near");
    expect(tickers).not.toContain("/markets/crypto/near-protocol");

    expect(coinSlugRedirect("/markets/crypto/near")).toBeNull();
    expect(coinSlugRedirect("/markets/crypto/bitcoin")).toBeNull();
    expect(cryptoDetailHref("near")).toBe("/markets/crypto/near");
    expect(paperAddReturnPath({ coinId: "near-protocol" })).toBe("/markets/crypto/near?buy=1");
    expect(permanentRedirect("/markets/crypto/matic-network")).toBe("/markets/crypto/polygon-ecosystem-token");

    const alias = await middleware(new NextRequest("https://aetherforgeai.co.nz/markets/crypto/near-protocol?buy=1"));
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe("https://aetherforgeai.co.nz/markets/crypto/near?buy=1");

    const canonical = await middleware(new NextRequest("https://aetherforgeai.co.nz/markets/crypto/near"));
    expect(canonical.status).not.toBe(308);
    expect(canonical.headers.get("location")).toBeNull();

    const matic = await middleware(new NextRequest("https://aetherforgeai.co.nz/markets/crypto/matic-network"));
    expect(matic.status).toBe(301);
    expect(matic.headers.get("location")).toBe("https://aetherforgeai.co.nz/markets/crypto/polygon-ecosystem-token");

    const page = read("src/app/markets/crypto/[id]/page.tsx");
    const index = read("src/lib/public-market-index.ts");
    expect(page).toContain('if (decision.action === "redirect") permanentRedirect(');
    expect(page).toContain("publicPageMetadata(`/markets/crypto/${id}`");
    expect(index).toContain("publicCoinSlug(coin.id)");
  });
});

describe("F5 coin meta description", () => {
  const asOf = "2026-11-10T19:18:00.000Z";
  const both = {
    slug: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    priceUsd: 73301,
    priceNzd: 130290.19,
    nzdSourced: true,
    asOf,
    source: "coingecko",
    marketCapUsd: 1.47e12,
  };

  it("leads with NZ$, puts US$ in brackets, and names the source", () => {
    const copy = cryptoDetailCopy(both);
    expect(copy.title).toBe("Bitcoin (BTC) price in NZD");
    expect(copy.description).toBe(
      "Bitcoin (BTC) NZ$130,290.19 (US$73,301.00) as of 11 Nov 2026, 8:18 am · Source: CoinGecko. Market cap US$1.47T."
    );
    expect(copy.description).not.toMatch(/\bbuy\b|\bsell\b/i);
  });

  it("drops a missing NZ$ or US$ amount without a dangling separator", () => {
    const usdOnly = cryptoDetailCopy({ ...both, priceNzd: null, nzdSourced: false });
    expect(usdOnly.title).toBe("Bitcoin (BTC) price in USD");
    expect(usdOnly.description).toBe(
      "Bitcoin (BTC) US$73,301.00 as of 11 Nov 2026, 8:18 am · Source: CoinGecko. Market cap US$1.47T."
    );
    expect(usdOnly.description).not.toContain("NZ$");
    expect(usdOnly.description).not.toMatch(/\(US\$|\(NZ\$|\(\s*\)/);

    const nzdOnly = cryptoDetailCopy({ ...both, priceUsd: null, marketCapUsd: null });
    expect(nzdOnly.description).toBe("Bitcoin (BTC) NZ$130,290.19 as of 11 Nov 2026, 8:18 am · Source: CoinGecko.");
    expect(nzdOnly.description).not.toContain("US$");
    expect(nzdOnly.description).not.toMatch(/\(US\$|\(NZ\$|\(\s*\)/);
    expect(nzdOnly.description).not.toMatch(/·\s*$/);

    const noSource = cryptoDetailCopy({ ...both, source: "  ", marketCapUsd: 0 });
    expect(noSource.description).toBe("Bitcoin (BTC) NZ$130,290.19 (US$73,301.00) as of 11 Nov 2026, 8:18 am.");
    expect(noSource.description).not.toContain(" · ");
    expect(noSource.description).not.toContain("Source:");
    expect(noSource.description).not.toContain("Market cap");

    const noTime = cryptoDetailCopy({ ...both, asOf: null, marketCapUsd: Number.NaN });
    expect(noTime.description).toContain("time not given by the data provider · Source: CoinGecko.");
    expect(noTime.description).not.toContain("Market cap");
    expect(noTime.description).not.toMatch(/\bNaN\b|\bundefined\b/);

    const none = cryptoDetailCopy({
      slug: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      priceUsd: Number.NaN,
      priceNzd: undefined,
      nzdSourced: true,
      source: undefined,
      marketCapUsd: undefined,
    });
    expect(none.description).toBe("Bitcoin (BTC) No earlier price is stored for this coin.");
    expect(none.description).not.toMatch(/\bNaN\b|\bundefined\b|\bnull\b/);
    expect(none.description).not.toContain(" · ");
    expect(none.description).not.toMatch(/\bbuy\b|\bsell\b/i);
  });

  it("stays within 160 characters for a long name and a micro price", () => {
    const copy = cryptoDetailCopy({
      slug: "wrapped-long-name",
      name: "International Wrapped Synthetic Liquid Staked Bitcoin Protocol Token",
      symbol: "VLWSBTC",
      priceUsd: 0.000001234,
      priceNzd: 0.000001234,
      nzdSourced: true,
      asOf: null,
      source: "coingecko",
      marketCapUsd: 1.47e12,
    });
    expect(copy.description.length).toBeLessThanOrEqual(160);
    expect(copy.description).toContain("0.000001234");
    expect(copy.description).not.toMatch(/\bNaN\b|\bundefined\b/);
    expect(copy.description).not.toMatch(/\(\s*\)/);
    expect(copy.description).not.toMatch(/[·(]\s*$/);
    expect(copy.description).not.toMatch(/·\s*\./);
    expect(copy.description).not.toMatch(/\bbuy\b|\bsell\b/i);
  });
});
