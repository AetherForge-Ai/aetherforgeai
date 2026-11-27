/**
 * TAPE-STALE-CLOSE: SSR must not keep last week's close after the NZX/ASX
 * ticker close date moves. A snapshot older than the latest ticker close is
 * stale. Cache-busted and no-store requests never render that older date.
 * The 250ms cap still bounds the wait; the fallback is the ticker's own
 * close, or no date at all.
 */
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/markets",
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

const headerState = { current: new Headers() };

vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
}));

const edgeJsonGet = vi.hoisted(() => vi.fn());
const edgeJsonPut = vi.hoisted(() => vi.fn(async () => undefined));
const tickerEquityQuotes = vi.hoisted(() =>
  vi.fn(async () => [] as Array<{ symbol: string; quotedAt: string | null; price: number | null; changePct: number | null }>),
);
const loadPublicTickerBounded = vi.hoisted(() => vi.fn(async () => null as unknown));

vi.mock("@/lib/ticker-serve", () => ({
  edgeJsonGet: (...args: unknown[]) => edgeJsonGet(...args),
  edgeJsonPut: (...args: unknown[]) => edgeJsonPut(...args),
}));

vi.mock("@/lib/public-ticker", () => ({
  tickerEquityQuotes: () => tickerEquityQuotes(),
  loadPublicTickerBounded: () => loadPublicTickerBounded(),
}));

vi.mock("@/lib/metals", () => ({
  getMetalsSpot: vi.fn(async () => null),
}));

import { middleware } from "@/middleware";
import { HomeTickerBand } from "@/app/page";
import { ServerTape } from "@/components/ServerTape";
import { formatUnitPrice } from "@/lib/currency";
import { closeLabelFor, equitySessionOpen, expectedEquityCloseIso, lastCompletedEquitySession, tapeCloseIso, tapeCloseIsPreviousSession } from "@/lib/market-freshness";
import { __test, loadRequestTape, requestTapeMustBeFresh, SSR_LIVE_WAIT_MS } from "@/lib/tape-ssr";
import type { TickerTapeFeed } from "@/lib/ticker-feed";

/** Sat 14 Nov 2026, 11:00 NZDT. The shut session is Friday 13 Nov. */
const SATURDAY = new Date("2026-11-13T22:00:00.000Z");
/** Mon 23 Nov 2026, 7:00am NZDT. The shut session is Friday 20 Nov. */
const MONDAY_OPEN = new Date("2026-11-22T18:00:00.000Z");
const OLD_CLOSE = "2026-11-13T04:00:24.000Z";
const NEW_CLOSE = "2026-11-20T04:00:08.000Z";
const STALE_PRICE = 0.385;
const FRESH_PRICE = 0.375;

function quotes(quotedAt: string, price: number) {
  return [
    { symbol: "AIR.NZ", quotedAt, price, changePct: -1 },
    { symbol: "FPH.NZ", quotedAt, price: 48.5, changePct: 0.2 },
    { symbol: "BHP.AX", quotedAt, price: 42.1, changePct: 0.1 },
  ];
}

function storedBody(quotedAt: string, price: number, version = 51) {
  const row = (symbol: string, value: number) => ({
    symbol,
    name: symbol,
    price: value,
    change: 0.4,
    currency: symbol.endsWith(".AX") ? "AUD" : "NZD",
    provider: "Yahoo Finance",
    asOf: quotedAt,
    quotedAt,
  });
  return {
    body: {
      ok: true,
      data: {
        rows: {
          nzx: [row("AIR.NZ", price), row("FPH.NZ", 48.5)],
          asx: [row("BHP.AX", 42.1)],
          crypto: [],
        },
        live: { crypto: false, equities: false },
        providers: { equities: "Yahoo Finance", crypto: null },
        asOf: quotedAt,
      } satisfies TickerTapeFeed,
    },
    headers: {},
    version,
  };
}

function prefix(html: string): string {
  const found = html.match(/data-tape-prefix="([^"]*)"/);
  return found?.[1] ?? "";
}

describe("TAPE-STALE-CLOSE", () => {
  beforeEach(() => {
    headerState.current = new Headers();
    edgeJsonGet.mockReset();
    edgeJsonGet.mockResolvedValue(null);
    edgeJsonPut.mockReset();
    edgeJsonPut.mockResolvedValue(undefined);
    tickerEquityQuotes.mockReset();
    tickerEquityQuotes.mockResolvedValue([]);
    loadPublicTickerBounded.mockReset();
    loadPublicTickerBounded.mockResolvedValue(null);
    __test?.resetTapeCloseMemory();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MONDAY_OPEN);
  });

  afterEach(() => {
    vi.useRealTimers();
    __test?.resetTapeCloseMemory();
  });

  it("treats a close before the shut session as the previous session", () => {
    expect(tapeCloseIso({ nzx: [{ quotedAt: NEW_CLOSE }] }, MONDAY_OPEN)).toBe("2026-11-20");
    expect(tapeCloseIso({ nzx: [{ quotedAt: OLD_CLOSE }] }, MONDAY_OPEN)).toBe("2026-11-13");
    expect(tapeCloseIsPreviousSession({ nzx: [{ quotedAt: OLD_CLOSE }] }, MONDAY_OPEN)).toBe(true);
    expect(tapeCloseIsPreviousSession({ nzx: [{ quotedAt: OLD_CLOSE }] }, SATURDAY)).toBe(false);
    expect(closeLabelFor("NZX", NEW_CLOSE, MONDAY_OPEN)).toBe("Close 20 Nov 2026");
    expect(SSR_LIVE_WAIT_MS).toBe(250);
  });

  it("a date advance invalidates the colo snapshot and the next SSR tape uses the new close", async () => {
    const colo = new Map<string, unknown>();
    colo.set("body", storedBody(OLD_CLOSE, STALE_PRICE));
    edgeJsonGet.mockImplementation(async (key: string) => colo.get(key) ?? null);
    edgeJsonPut.mockImplementation(async (key: string, value: unknown) => {
      colo.set(key, value);
    });
    vi.setSystemTime(SATURDAY);
    const friday = await loadRequestTape();
    expect(tapeCloseIso(friday?.rows ?? {}, SATURDAY)).toBe("2026-11-13");
    expect(prefix(renderToString(await ServerTape()))).toBe("Close 13 Nov 2026");

    vi.setSystemTime(MONDAY_OPEN);
    tickerEquityQuotes.mockResolvedValue(quotes(NEW_CLOSE, FRESH_PRICE));
    const monday = await loadRequestTape();
    expect(monday?.rows.nzx.find((row) => row.symbol === "AIR.NZ")?.price).toBe(FRESH_PRICE);
    expect(tapeCloseIso(monday?.rows ?? {}, MONDAY_OPEN)).toBe("2026-11-20");
    const replaced = colo.get("body") as { version?: number; body?: { data?: TickerTapeFeed } };
    expect(replaced.version).toBe(51);
    expect(replaced.body?.data?.rows.nzx.find((row) => row.symbol === "AIR.NZ")?.price).toBe(FRESH_PRICE);
    expect(replaced.body?.data?.rows.nzx[0]?.quotedAt).toBe(NEW_CLOSE);

    tickerEquityQuotes.mockResolvedValue([]);
    loadPublicTickerBounded.mockResolvedValue(null);
    const again = await loadRequestTape();
    expect(again?.rows.nzx.find((row) => row.symbol === "AIR.NZ")?.price).toBe(FRESH_PRICE);
    expect(prefix(renderToString(await ServerTape()))).toBe("Close 20 Nov 2026");
  });

  it("never renders a stale snapshot, including on a cache-busted or no-store request", async () => {
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(OLD_CLOSE, STALE_PRICE) : null));
    tickerEquityQuotes.mockResolvedValue(quotes(NEW_CLOSE, FRESH_PRICE));
    const staleText = formatUnitPrice(STALE_PRICE, "NZD");
    const freshText = formatUnitPrice(FRESH_PRICE, "NZD");

    for (const fresh of [false, true]) {
      headerState.current = fresh ? new Headers({ "x-af-tape-fresh": "1", "x-af-search": "?cb=1" }) : new Headers();
      const html = renderToString(await ServerTape());
      const home = renderToString(await HomeTickerBand());
      expect(prefix(html)).toBe("Close 20 Nov 2026");
      expect(prefix(home)).toBe("Close 20 Nov 2026");
      expect(html).toContain(freshText);
      expect(html).not.toContain(staleText);
      expect(html).not.toContain("Close 13 Nov 2026");
      expect(home).not.toContain("Close 13 Nov 2026");
      expect(home).not.toContain(staleText);
      expect(await requestTapeMustBeFresh()).toBe(fresh);
    }
  });

  it("SSR prefix matches the ticker close date on the shell and the home tape", async () => {
    tickerEquityQuotes.mockResolvedValue(quotes(NEW_CLOSE, FRESH_PRICE));
    const label = closeLabelFor("NZX", NEW_CLOSE, MONDAY_OPEN);
    const shell = renderToString(await ServerTape());
    const home = renderToString(await HomeTickerBand());
    expect(prefix(shell)).toBe(label);
    expect(prefix(home)).toBe(label);
    expect(shell).toContain(formatUnitPrice(FRESH_PRICE, "NZD"));
    expect(home).toContain('data-tape-prefix="Close 20 Nov 2026"');
    expect(readFileSync("src/app/markets/page.tsx", "utf8")).toContain("AppShell");
    expect(readFileSync("src/app/tax/page.tsx", "utf8")).toContain("AppShell");
    expect(readFileSync("src/app/markets/daily-prices/page.tsx", "utf8")).toContain("AppShell");
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain("loadRequestTape()");
  });

  it("after 250ms without a fresh close, omits the date instead of printing the older one", async () => {
    loadPublicTickerBounded.mockImplementation(() => new Promise(() => undefined));
    tickerEquityQuotes.mockResolvedValue([]);
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(OLD_CLOSE, STALE_PRICE) : null));
    const started = performance.now();
    const tape = await loadRequestTape({ fresh: true });
    const elapsed = performance.now() - started;
    expect(tape).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(SSR_LIVE_WAIT_MS - 40);
    expect(elapsed).toBeLessThan(SSR_LIVE_WAIT_MS + 400);
    const html = renderToString(await ServerTape());
    expect(html).not.toContain("Close 13 Nov 2026");
    expect(html).not.toContain(formatUnitPrice(STALE_PRICE, "NZD"));
    expect(prefix(html)).toBe("");
  });

  it("uses the ticker's own close label when the live read does not finish in 250ms", async () => {
    loadPublicTickerBounded.mockImplementation(() => new Promise(() => undefined));
    tickerEquityQuotes.mockResolvedValue(quotes(NEW_CLOSE, FRESH_PRICE));
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(OLD_CLOSE, STALE_PRICE) : null));
    const started = performance.now();
    const tape = await loadRequestTape({ fresh: true });
    expect(performance.now() - started).toBeLessThan(SSR_LIVE_WAIT_MS);
    expect(tapeCloseIso(tape?.rows ?? {}, MONDAY_OPEN)).toBe("2026-11-20");
    expect(prefix(renderToString(await ServerTape()))).toBe(closeLabelFor("NZX", NEW_CLOSE, MONDAY_OPEN));
  });

  it("a current close still returns without waiting out a slow live read", async () => {
    loadPublicTickerBounded.mockImplementation(() => new Promise(() => undefined));
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(NEW_CLOSE, FRESH_PRICE) : null));
    const started = performance.now();
    const tape = await loadRequestTape();
    expect(performance.now() - started).toBeLessThan(SSR_LIVE_WAIT_MS);
    expect(tape?.rows.nzx.find((row) => row.symbol === "AIR.NZ")?.price).toBe(FRESH_PRICE);
    expect(tapeCloseIso(tape?.rows ?? {}, MONDAY_OPEN)).toBe("2026-11-20");
  });

  it("a stale equity quote is not authority to print the same stale colo close", async () => {
    tickerEquityQuotes.mockResolvedValue(quotes(OLD_CLOSE, STALE_PRICE));
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(OLD_CLOSE, STALE_PRICE) : null));
    loadPublicTickerBounded.mockResolvedValue(null);
    expect(expectedEquityCloseIso(MONDAY_OPEN)).toBe("2026-11-20");
    const tape = await loadRequestTape({ fresh: true });
    expect(tape).toBeNull();
    const html = renderToString(await ServerTape());
    expect(html).not.toContain("Close 13 Nov 2026");
    expect(html).not.toContain(formatUnitPrice(STALE_PRICE, "NZD"));
    expect(prefix(html)).toBe("");
  });

  it("an open session does not return a week-old colo body before the 250ms wait", async () => {
    /** Wed 18 Nov 2026, 1:00pm NZDT / 11:00am Sydney. NZX and ASX are both open. */
    const OPEN = new Date("2026-11-18T00:00:00.000Z");
    vi.setSystemTime(OPEN);
    expect(equitySessionOpen("NZX", OPEN)).toBe(true);
    expect(equitySessionOpen("ASX", OPEN)).toBe(true);
    expect(lastCompletedEquitySession("NZX", OPEN)).toBe("2026-11-17");
    expect(lastCompletedEquitySession("ASX", OPEN)).toBe("2026-11-17");
    tickerEquityQuotes.mockImplementation(() => new Promise(() => undefined));
    loadPublicTickerBounded.mockImplementation(() => new Promise(() => undefined));
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(OLD_CLOSE, STALE_PRICE) : null));
    const started = performance.now();
    const tape = await loadRequestTape({ fresh: true });
    const elapsed = performance.now() - started;
    expect(tape).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(SSR_LIVE_WAIT_MS - 40);
    expect(elapsed).toBeLessThan(SSR_LIVE_WAIT_MS + 400);
    const html = renderToString(await ServerTape());
    expect(html).not.toContain("Close 13 Nov 2026");
    expect(html).not.toContain(formatUnitPrice(STALE_PRICE, "NZD"));
  });

  it("an open session still serves the previous completed close without waiting", async () => {
    const OPEN = new Date("2026-11-18T00:00:00.000Z");
    vi.setSystemTime(OPEN);
    const previous = "2026-11-17T04:00:08.000Z";
    tickerEquityQuotes.mockImplementation(() => new Promise(() => undefined));
    loadPublicTickerBounded.mockImplementation(() => new Promise(() => undefined));
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(previous, FRESH_PRICE) : null));
    const started = performance.now();
    const tape = await loadRequestTape();
    expect(performance.now() - started).toBeLessThan(SSR_LIVE_WAIT_MS);
    expect(tape?.rows.nzx.find((row) => row.symbol === "AIR.NZ")?.price).toBe(FRESH_PRICE);
    expect(tapeCloseIso(tape?.rows ?? {}, OPEN)).toBe("2026-11-17");
  });

  it("a rejected ticker quote read settles the wait instead of spinning", async () => {
    tickerEquityQuotes.mockRejectedValue(new Error("colo equity unread"));
    loadPublicTickerBounded.mockImplementation(() => new Promise(() => undefined));
    edgeJsonGet.mockResolvedValue(null);
    const started = performance.now();
    const tape = await loadRequestTape({ fresh: true });
    const elapsed = performance.now() - started;
    expect(tape).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(SSR_LIVE_WAIT_MS - 40);
    expect(elapsed).toBeLessThan(1_000);
    expect(prefix(renderToString(await ServerTape()))).toBe("");
  });

  it("marks cache-busted and no-store documents, and leaves a shared marketing document unmarked", async () => {
    const tax = await middleware(new NextRequest("https://www.aetherforgeai.co.nz/tax"));
    const daily = await middleware(new NextRequest("https://www.aetherforgeai.co.nz/markets/daily-prices"));
    const bust = await middleware(new NextRequest("https://www.aetherforgeai.co.nz/?cb=1"));
    const home = await middleware(new NextRequest("https://www.aetherforgeai.co.nz/"));
    expect(tax.headers.get("x-middleware-request-x-af-tape-fresh")).toBe("1");
    expect(daily.headers.get("x-middleware-request-x-af-tape-fresh")).toBe("1");
    expect(bust.headers.get("x-middleware-request-x-af-tape-fresh")).toBe("1");
    expect(bust.headers.get("x-middleware-request-x-af-search")).toContain("cb=");
    expect(home.headers.get("x-middleware-request-x-af-tape-fresh")).toBeNull();
    expect(readFileSync("src/app/api/ticker/route.ts", "utf8")).toMatch(/snap\.version > prevVersion && bodyHasEquities\(body\)/);
    expect(readFileSync("src/app/api/ticker/route.ts", "utf8")).toContain("closeAdvanced");
  });
});
