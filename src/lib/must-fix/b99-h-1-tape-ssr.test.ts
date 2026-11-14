/**
 * H-1-TAPE-SSR: the server HTML of the header tape uses the quote snapshot's
 * close label. An empty snapshot stays on the neutral fallback, and the client
 * first paint matches that HTML (no hydration mismatch).
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tax",
}));

const edgeJsonGet = vi.hoisted(() => vi.fn());
const tickerEquityQuotes = vi.hoisted(() => vi.fn(async () => [] as Array<{ symbol: string; quotedAt: string | null; price: number | null; changePct: number | null }>));

vi.mock("@/lib/ticker-serve", () => ({
  edgeJsonGet: (...args: unknown[]) => edgeJsonGet(...args),
}));

vi.mock("@/lib/public-ticker", () => ({
  tickerEquityQuotes: () => tickerEquityQuotes(),
}));

import { MarketTicker } from "@/components/MarketTicker";
import { ServerTape, TapePending } from "@/components/ServerTape";
import { closeLabelFor } from "@/lib/market-freshness";
import { loadServerTape, tapeFeedFromStored } from "@/lib/tape-ssr";
import type { TickerTapeFeed } from "@/lib/ticker-feed";

/** Sat 14 Nov 2026, 11:00 NZDT. NZX and ASX are shut; Friday's session was 13 Nov. */
const SATURDAY = new Date("2026-11-13T22:00:00.000Z");
/** Two seconds later, still Saturday, still shut. The close date must not move. */
const SATURDAY_LATER = new Date(SATURDAY.getTime() + 2_000);
const FRI_CLOSE = "2026-11-13T04:00:08Z";

const read = (path: string) => readFileSync(path, "utf8");

function fridayFeed(): TickerTapeFeed {
  const row = (symbol: string, price: number) => ({
    symbol,
    name: symbol,
    price,
    change: 0.4,
    currency: symbol.endsWith(".AX") ? "AUD" : "NZD",
    provider: "Yahoo Finance",
    asOf: FRI_CLOSE,
    quotedAt: FRI_CLOSE,
  });
  return {
    rows: {
      nzx: [row("FPH.NZ", 36.2), row("AIR.NZ", 0.55)],
      asx: [row("BHP.AX", 42.1)],
      crypto: [],
    },
    live: { crypto: false, equities: false },
    providers: { equities: "Yahoo Finance", crypto: null },
    asOf: FRI_CLOSE,
  };
}

/** The object ticker-serve writes under the last-good body key. */
function storedBody(feed: TickerTapeFeed) {
  return {
    body: { ok: true, data: feed },
    headers: { "x-af-snapshot-at": FRI_CLOSE },
    version: 51,
  };
}

function prefix(html: string): string {
  const found = html.match(/data-tape-prefix="([^"]*)"/);
  return found?.[1] ?? "";
}

describe("H-1-TAPE-SSR tape prefix in server HTML", () => {
  beforeEach(() => {
    edgeJsonGet.mockReset();
    tickerEquityQuotes.mockReset();
    tickerEquityQuotes.mockResolvedValue([]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SATURDAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("with a quote snapshot, the server HTML has the API close date and no Close unavailable", async () => {
    const feed = fridayFeed();
    const apiLabel = closeLabelFor("NZX", FRI_CLOSE, SATURDAY);
    expect(apiLabel).toBe("Close 13 Nov 2026");
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(feed) : null));

    const loaded = await loadServerTape();
    expect(loaded?.rows.nzx[0]?.symbol).toBe("FPH.NZ");
    expect(loaded?.rows.nzx[0]?.quotedAt).toBe(FRI_CLOSE);

    const element = await ServerTape();
    const serverHtml = renderToString(element);
    const clientHtml = renderToString(element);
    expect(clientHtml).toBe(serverHtml);
    expect(serverHtml.split("Close unavailable").length - 1).toBe(0);
    expect(prefix(serverHtml)).toBe(apiLabel);
    expect(serverHtml).toContain("FPH.NZ");
    expect(serverHtml).not.toMatch(/\b(buy|sell)\b/i);

    // Releasing the server clock (what mount does) keeps the same close label.
    vi.setSystemTime(SATURDAY_LATER);
    const released = renderToString(createElement(MarketTicker, { compact: true, initial: feed, serverNow: null }));
    expect(prefix(released)).toBe(apiLabel);
    expect(released).not.toContain("Close unavailable");
  });

  it("reads the equity-row copy when the stored body has no quote time", async () => {
    const bare = fridayFeed();
    bare.rows.nzx = bare.rows.nzx.map((row) => ({ ...row, quotedAt: null }));
    bare.rows.asx = bare.rows.asx.map((row) => ({ ...row, quotedAt: null }));
    expect(tapeFeedFromStored(storedBody(bare))).toBeNull();
    edgeJsonGet.mockImplementation(async (key: string) =>
      key === "equity"
        ? { nzx: fridayFeed().rows.nzx, asx: fridayFeed().rows.asx }
        : null,
    );
    const loaded = await loadServerTape();
    expect(loaded?.rows.nzx[0]?.quotedAt).toBe(FRI_CLOSE);
    const html = renderToString(await ServerTape());
    expect(prefix(html)).toBe("Close 13 Nov 2026");
    expect(html).not.toContain("Close unavailable");
  });

  it("with no snapshot, the neutral fallback is in the HTML and the client paint matches", async () => {
    edgeJsonGet.mockResolvedValue(null);
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });
    try {
      const element = await ServerTape();
      const serverHtml = renderToString(element);
      const clientHtml = renderToString(element);
      expect(clientHtml).toBe(serverHtml);
      expect(prefix(serverHtml)).toBe("Close unavailable");
      expect(serverHtml).toContain("Close unavailable");
      const pending = renderToStaticMarkup(createElement(TapePending));
      expect(pending).not.toContain("Close unavailable");
      const warned = errors.flat().map(String).join("\n");
      expect(warned).not.toMatch(/hydration|did not match|server rendered text/i);
    } finally {
      spy.mockRestore();
    }
  });

  it("wires the shell at the ticker-serve snapshot and leaves the home first load alone", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toContain("<ServerTape />");
    expect(shell).toContain("<TapePending />");
    expect(shell).toContain("<Suspense");
    expect(shell).not.toContain("<MarketTicker");
    expect(shell).not.toContain("Close unavailable");
    const server = read("src/components/ServerTape.tsx");
    expect(server).toContain("loadServerTape()");
    expect(server).toContain("initial={tape}");
    expect(server).toContain("serverNow=");
    const loader = read("src/lib/tape-ssr.ts");
    expect(loader).toContain('edgeJsonGet<unknown>("body"');
    expect(loader).toContain('edgeJsonGet<unknown>("equity"');
    expect(loader).not.toMatch(/\b(buy|sell)\b/i);
    expect(server).not.toMatch(/\b(buy|sell)\b/i);
    const page = read("src/app/page.tsx");
    const layout = read("src/app/layout.tsx");
    const lazy = read("src/components/LazyMarketTicker.tsx");
    expect(page).toContain("LazyMarketTicker");
    expect(page).not.toContain("tape-ssr");
    expect(page).not.toContain("ServerTape");
    expect(layout).not.toContain("tape-ssr");
    expect(layout).not.toContain("ServerTape");
    expect(lazy).toMatch(/ssr:\s*false/);
  });
});
