/**
 * TAPE-STALE-CLOSE routes: /, /markets, /markets/daily-prices and /tax, plus
 * the header tape, all render loadRequestTape. None of them import the build
 * snapshot. With or without ?cb= and no-store, every close prefix matches the
 * ticker's close, not the 13 Nov snapshot.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isValidElement, createElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
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
  MARKETS_SSR_DEADLINE_MS: 3_000,
  withDeadline: async <T,>(work: Promise<T>, _ms: number, fallback: T) => {
    try {
      return await work;
    } catch {
      return fallback;
    }
  },
}));

vi.mock("@/lib/public-ticker", () => ({
  tickerEquityQuotes: () => tickerEquityQuotes(),
  loadPublicTickerBounded: () => loadPublicTickerBounded(),
}));

vi.mock("@/lib/metals", () => ({
  getMetalsSpot: vi.fn(async () => null),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(async () => null),
}));

vi.mock("@/lib/public-market-index", () => ({
  loadPublicMarketIndex: vi.fn(async () => null),
  ensureCryptoTab: vi.fn(async (built: unknown) => built),
}));

vi.mock("@/lib/daily-price-history.server", () => ({
  readDailyPriceHistory: vi.fn(async () => ({ ok: false, reason: "history unavailable" })),
  loadReportPredictions: vi.fn(async () => []),
}));

vi.mock("@/lib/tax-book-server", () => ({
  loadTaxBookFigures: vi.fn(async () => null),
}));

import { middleware } from "@/middleware";
import LandingPage, { HomeTickerBand } from "@/app/page";
import MarketsPage from "@/app/markets/page";
import DailyPricesPage from "@/app/markets/daily-prices/page";
import TaxPage from "@/app/tax/page";
import { AppShell } from "@/components/AppShell";
import { MarketTicker } from "@/components/MarketTicker";
import { ServerTape } from "@/components/ServerTape";
import { formatUnitPrice } from "@/lib/currency";
import { closeLabelFor } from "@/lib/market-freshness";
import { resetTapeCloseMemoryForTests } from "@/lib/tape-ssr";
import type { TickerTapeFeed } from "@/lib/ticker-feed";

/** Tue 24 Nov 2026, 7:08am NZDT. The shut session is Monday 23 Nov. */
const TUESDAY_MORNING = new Date("2026-11-23T18:08:00.000Z");
const OLD_CLOSE = "2026-11-13T04:00:24.000Z";
const NEW_CLOSE = "2026-11-23T04:00:08.000Z";
const STALE_PRICE = 0.385;
const FRESH_PRICE = 0.412;

const ROUTES = ["/", "/markets", "/markets/daily-prices", "/tax"] as const;

function quotes() {
  return [
    { symbol: "AIR.NZ", quotedAt: NEW_CLOSE, price: FRESH_PRICE, changePct: 0.4 },
    { symbol: "FPH.NZ", quotedAt: NEW_CLOSE, price: 36.2, changePct: 0.2 },
    { symbol: "BHP.AX", quotedAt: NEW_CLOSE, price: 42.1, changePct: 0.1 },
  ];
}

function staleBody() {
  const row = (symbol: string, price: number) => ({
    symbol,
    name: symbol,
    price,
    change: 0.4,
    currency: symbol.endsWith(".AX") ? "AUD" : "NZD",
    provider: "Yahoo Finance",
    asOf: OLD_CLOSE,
    quotedAt: OLD_CLOSE,
  });
  return {
    body: {
      ok: true,
      data: {
        rows: { nzx: [row("AIR.NZ", STALE_PRICE), row("FPH.NZ", 48.48)], asx: [row("BHP.AX", 40)], crypto: [] },
        live: { crypto: false, equities: false },
        providers: { equities: "Yahoo Finance", crypto: null },
        asOf: OLD_CLOSE,
      },
    },
    headers: {},
    version: 51,
  };
}

function walk(node: ReactNode, visit: (el: ReactElement) => void) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!isValidElement(node)) return;
  visit(node);
  walk((node.props as { children?: ReactNode }).children, visit);
}

function findAll(node: ReactNode, type: unknown): ReactElement[] {
  const found: ReactElement[] = [];
  walk(node, (el) => {
    if (el.type === type) found.push(el);
  });
  return found;
}

function closePrefixes(html: string): string[] {
  return [...html.matchAll(/data-tape-prefix="([^"]*)"/g)].map((match) => match[1]).filter((label) => label.startsWith("Close"));
}

function snapshotConsumers(): string[] {
  const root = "src";
  const out: string[] = [];
  const walkDir = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walkDir(full);
      else if (/\.(tsx?|jsx?|mjs)$/.test(name) && !name.endsWith(".test.ts")) {
        if (readFileSync(full, "utf8").includes("tape-build-snapshot")) out.push(full.split(path.sep).join("/"));
      }
    }
  };
  walkDir(root);
  if (readFileSync("scripts/refresh-tape-snapshot.mjs", "utf8").includes("tape-build-snapshot")) {
    out.push("scripts/refresh-tape-snapshot.mjs");
  }
  return out.sort();
}

async function requestFor(route: (typeof ROUTES)[number], opts: { cb: boolean; noStore: boolean }) {
  const url = `https://www.aetherforgeai.co.nz${route}${opts.cb ? "?cb=1" : ""}`;
  const inbound = new Headers();
  if (opts.noStore) inbound.set("cache-control", "no-store");
  const res = await middleware(new NextRequest(url, { headers: inbound }));
  const seen = new Headers();
  res.headers.forEach((value, key) => {
    const prefix = "x-middleware-request-";
    if (key.startsWith(prefix)) seen.set(key.slice(prefix.length), value);
  });
  if (opts.noStore) seen.set("cache-control", "no-store");
  headerState.current = seen;
}

describe("TAPE-STALE-CLOSE route tapes", () => {
  const expected = closeLabelFor("NZX", NEW_CLOSE, TUESDAY_MORNING);

  beforeEach(() => {
    headerState.current = new Headers();
    edgeJsonGet.mockReset();
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? staleBody() : null));
    edgeJsonPut.mockReset();
    edgeJsonPut.mockResolvedValue(undefined);
    tickerEquityQuotes.mockReset();
    tickerEquityQuotes.mockResolvedValue(quotes());
    loadPublicTickerBounded.mockReset();
    loadPublicTickerBounded.mockResolvedValue(null);
    resetTapeCloseMemoryForTests();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TUESDAY_MORNING);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetTapeCloseMemoryForTests();
  });

  it("the build snapshot has one runtime consumer, tape-ssr, and the refresh script", () => {
    expect(expected).toBe("Close 23 Nov 2026");
    expect(snapshotConsumers()).toEqual(["scripts/refresh-tape-snapshot.mjs", "src/lib/tape-ssr.ts"]);
    for (const file of ["src/app/page.tsx", "src/app/markets/page.tsx", "src/app/markets/daily-prices/page.tsx", "src/app/tax/page.tsx", "src/components/AppShell.tsx", "src/components/ServerTape.tsx", "src/components/MarketTicker.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("tape-build-snapshot");
    }
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain("loadRequestTape()");
    expect(readFileSync("src/components/ServerTape.tsx", "utf8")).toContain("loadRequestTape()");
    expect(readFileSync("src/components/AppShell.tsx", "utf8")).toContain("<ServerTape />");
    for (const file of ["src/app/markets/page.tsx", "src/app/markets/daily-prices/page.tsx", "src/app/tax/page.tsx"]) {
      expect(readFileSync(file, "utf8")).toContain("AppShell");
    }
  });

  it.each([
    { cb: false, noStore: false },
    { cb: true, noStore: false },
    { cb: false, noStore: true },
    { cb: true, noStore: true },
  ])("/ matches the ticker close (cb=$cb noStore=$noStore)", async (opts) => {
    await requestFor("/", opts);
    const page = LandingPage();
    expect(findAll(page, HomeTickerBand)).toHaveLength(1);
    const band = await HomeTickerBand();
    const html = renderToString(band);
    expect(closePrefixes(html)).toEqual([expected]);
    expect(html).not.toContain("Close 13 Nov 2026");

    const seeded: ReactElement[] = [];
    walk(band, (el) => {
      const initial = (el.props as { initial?: TickerTapeFeed | null }).initial;
      if (initial?.rows) seeded.push(el);
    });
    const initial = (seeded[0]?.props as { initial?: TickerTapeFeed | null }).initial ?? null;
    expect(initial?.rows.nzx.find((row) => row.symbol === "AIR.NZ")?.price).toBe(FRESH_PRICE);
    const now = TUESDAY_MORNING.toISOString();
    const rows = renderToString(createElement(MarketTicker, { initial, serverNow: now }));
    const header = renderToString(createElement(MarketTicker, { compact: true, initial, serverNow: now }));
    for (const rendered of [rows, header]) {
      const prefixes = closePrefixes(rendered);
      expect(prefixes.length).toBeGreaterThan(0);
      expect(prefixes.every((label) => label === expected)).toBe(true);
      expect(rendered).not.toContain("Close 13 Nov 2026");
      expect(rendered).toContain(formatUnitPrice(FRESH_PRICE, "NZD"));
      expect(rendered).not.toContain(formatUnitPrice(STALE_PRICE, "NZD"));
    }
    expect(rows).toContain("NZX 50");
    expect(rows).toContain("ASX 200");
  });

  it.each([
    { route: "/markets" as const, load: () => MarketsPage({ searchParams: Promise.resolve({}) }) },
    { route: "/markets/daily-prices" as const, load: () => DailyPricesPage() },
    { route: "/tax" as const, load: () => TaxPage() },
  ])("$route header tape matches the ticker close with and without ?cb= and no-store", async ({ route, load }) => {
    for (const opts of [
      { cb: false, noStore: false },
      { cb: true, noStore: false },
      { cb: false, noStore: true },
      { cb: true, noStore: true },
    ]) {
      await requestFor(route, opts);
      const page = await load();
      expect(page.type).toBe(AppShell);
      const shell = AppShell(page.props);
      const tapes = findAll(shell, ServerTape);
      expect(tapes).toHaveLength(1);
      const html = renderToString(await tapes[0].type(tapes[0].props));
      expect(closePrefixes(html)).toEqual([expected]);
      expect(html).not.toContain("Close 13 Nov 2026");
      expect(html).toContain(formatUnitPrice(FRESH_PRICE, "NZD"));
      expect(html).not.toContain(formatUnitPrice(STALE_PRICE, "NZD"));
    }
  });
});
