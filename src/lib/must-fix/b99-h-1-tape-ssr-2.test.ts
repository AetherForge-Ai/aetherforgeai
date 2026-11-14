/**
 * H-1-TAPE-SSR-2: AppShell uses the same tape as home. A live ticker fills
 * "Close <date>" when the stored snapshot is empty. Neither source means the
 * server HTML stays pending and does not say "Close unavailable".
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tax",
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

const edgeJsonGet = vi.hoisted(() => vi.fn());
const loadPublicTickerBounded = vi.hoisted(() => vi.fn(async () => null as unknown));

vi.mock("@/lib/ticker-serve", () => ({
  edgeJsonGet: (...args: unknown[]) => edgeJsonGet(...args),
}));

vi.mock("@/lib/public-ticker", () => ({
  tickerEquityQuotes: vi.fn(async () => []),
  loadPublicTickerBounded: () => loadPublicTickerBounded(),
}));

import { ServerTape } from "@/components/ServerTape";
import { closeLabelFor } from "@/lib/market-freshness";
import { quotedTape } from "@/lib/tape-ssr";
import type { TickerTapeFeed } from "@/lib/ticker-feed";

/** Sat 14 Nov 2026, 11:00 NZDT. NZX and ASX are shut. */
const SATURDAY = new Date("2026-11-13T22:00:00.000Z");
const FRI_CLOSE = "2026-11-13T04:00:08Z";

function liveFeed(price: number): TickerTapeFeed {
  const row = (symbol: string) => ({
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
      nzx: [row("FPH.NZ"), row("AIR.NZ")],
      asx: [row("BHP.AX")],
      crypto: [],
    },
    live: { crypto: false, equities: false },
    providers: { equities: "Yahoo Finance", crypto: null },
    asOf: FRI_CLOSE,
  };
}

describe("H-1-TAPE-SSR-2 shell tape", () => {
  beforeEach(() => {
    edgeJsonGet.mockReset();
    edgeJsonGet.mockResolvedValue(null);
    loadPublicTickerBounded.mockReset();
    loadPublicTickerBounded.mockResolvedValue(null);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SATURDAY);
  });

  it("an empty snapshot with a live ticker puts Close <date> in the AppShell tape HTML", async () => {
    loadPublicTickerBounded.mockResolvedValue(liveFeed(36.2));
    const html = renderToString(await ServerTape());
    const label = closeLabelFor("NZX", FRI_CLOSE, SATURDAY);
    expect(label).toBe("Close 13 Nov 2026");
    expect(html).toContain(label);
    expect(html).toContain("FPH.NZ");
    expect(html).not.toContain("Close unavailable");
    expect(html).toContain('data-market-ticker="compact"');
  });

  it("with neither a live ticker nor a snapshot, the HTML has no Close unavailable", async () => {
    const html = renderToString(await ServerTape());
    expect(html).not.toContain("Close unavailable");
    expect(html).toContain("data-tape-pending");
    expect(html).toContain("Loading prices…");
  });

  it("drops zero prices from the live ticker before the close label", async () => {
    const zeros = liveFeed(0);
    expect(quotedTape(zeros)).toBeNull();
    loadPublicTickerBounded.mockResolvedValue(zeros);
    const html = renderToString(await ServerTape());
    expect(html).not.toContain("FPH.NZ");
    expect(html).not.toContain("Close unavailable");
    expect(html).not.toMatch(/\$0\.00/);
    const mixed = liveFeed(36.2);
    mixed.rows.nzx = [{ ...mixed.rows.nzx[0], price: 0 }, { ...mixed.rows.nzx[1], price: 0.55 }];
    const kept = quotedTape(mixed);
    expect(kept?.rows.nzx.map((row) => row.symbol)).toEqual(["AIR.NZ"]);
    expect(kept?.rows.asx.map((row) => row.symbol)).toEqual(["BHP.AX"]);
  });
});
