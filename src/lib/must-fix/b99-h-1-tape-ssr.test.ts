/**
 * H-1-TAPE-SSR: the server HTML of the header tape uses the quote snapshot's
 * close label. An empty snapshot stays on the neutral fallback, and the client
 * first paint matches that HTML (no hydration mismatch).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tax",
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

const edgeJsonGet = vi.hoisted(() => vi.fn());
const tickerEquityQuotes = vi.hoisted(() =>
  vi.fn(async () => [] as Array<{ symbol: string; quotedAt: string | null; price: number | null; changePct: number | null }>),
);
const loadPublicTickerBounded = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/ticker-serve", () => ({
  edgeJsonGet: (...args: unknown[]) => edgeJsonGet(...args),
}));

vi.mock("@/lib/public-ticker", () => ({
  tickerEquityQuotes: () => tickerEquityQuotes(),
  loadPublicTickerBounded: () => loadPublicTickerBounded(),
}));

vi.mock("@/lib/metals", () => ({
  getMetalsSpot: vi.fn(async () => null),
}));

import { MarketTicker } from "@/components/MarketTicker";
import { ServerTape, TapePending } from "@/components/ServerTape";
import { HomeTickerBand } from "@/app/page";
import { connection } from "next/server";
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
    loadPublicTickerBounded.mockReset();
    loadPublicTickerBounded.mockResolvedValue(null);
    vi.mocked(connection).mockClear();
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
    expect(server).toContain("await connection()");
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
    expect(page).toContain("await connection()");
    expect(page).toContain("loadServerTape()");
    expect(page).not.toContain("<ServerTape");
    expect(layout).not.toContain("tape-ssr");
    expect(layout).not.toContain("ServerTape");
    expect(lazy).toMatch(/ssr:\s*false/);
    expect(vi.mocked(connection)).not.toHaveBeenCalled();
  });

  it("drops rows whose price is missing, zero, or not a finite positive number", async () => {
    const junk = {
      rows: {
        nzx: [
          { symbol: "FPH.NZ", price: 0, quotedAt: FRI_CLOSE },
          { symbol: "AIR.NZ", price: Number.NaN, quotedAt: FRI_CLOSE },
          { symbol: "MEL.NZ", price: null, quotedAt: FRI_CLOSE },
          { symbol: "CEN.NZ", price: Number.POSITIVE_INFINITY, quotedAt: FRI_CLOSE },
          { symbol: "SPK.NZ", name: "Spark", price: 3.2, change: 0.1, currency: "NZD", quotedAt: FRI_CLOSE },
        ],
        asx: [{ symbol: "BHP.AX", price: -1, quotedAt: FRI_CLOSE }],
        crypto: [{ symbol: "BTC", price: 0, quotedAt: FRI_CLOSE }],
      },
    };
    const feed = tapeFeedFromStored(junk);
    expect(feed?.rows.nzx.map((row) => row.symbol)).toEqual(["SPK.NZ"]);
    expect(feed?.rows.asx).toEqual([]);
    expect(feed?.rows.crypto).toEqual([]);
    edgeJsonGet.mockResolvedValue(null);
    tickerEquityQuotes.mockResolvedValue([
      { symbol: "FPH.NZ", quotedAt: FRI_CLOSE, price: 0, changePct: 1 },
      { symbol: "AIR.NZ", quotedAt: FRI_CLOSE, price: 0.55, changePct: 0.2 },
    ]);
    const loaded = await loadServerTape();
    expect(loaded?.rows.nzx.map((row) => row.symbol)).toEqual(["AIR.NZ"]);
    const html = renderToString(createElement(MarketTicker, { compact: true, initial: feed, serverNow: SATURDAY.toISOString() }));
    expect(html).toContain("SPK.NZ");
    expect(html).not.toContain("FPH.NZ");
    expect(html).not.toContain("BHP.AX");
    expect(html).not.toMatch(/\$0\.00/);
  });

  it("opts the tape out of static caching and renders Close <date> for / and /markets when a snapshot is seeded", async () => {
    expect(vi.mocked(connection)).not.toHaveBeenCalled();
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(fridayFeed()) : null));
    const markets = renderToString(await ServerTape());
    const home = renderToString(await HomeTickerBand());
    expect(vi.mocked(connection).mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const html of [markets, home]) {
      expect(html).toMatch(/Close \d{1,2} [A-Za-z]{3} \d{4}/);
      expect(html).toContain("Close 13 Nov 2026");
      expect(html).not.toContain("Close unavailable");
    }
    expect(prefix(markets)).toBe("Close 13 Nov 2026");
    expect(home).toContain('data-tape-prefix="Close 13 Nov 2026"');
    expect(home).toMatch(/aria-hidden="true"[^>]*data-tape-prefix="Close 13 Nov 2026"|data-tape-prefix="Close 13 Nov 2026"[^>]*aria-hidden="true"/);
    expect(read("src/app/page.tsx")).toMatch(/aria-hidden="true" data-tape-prefix=\{close\}/);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full.split(path.sep).join("/"));
  }
  return out;
}

function isClientModule(file: string): boolean {
  return /^\uFEFF?\s*["']use client["']/.test(read(file));
}

function segmentFlags(file: string): { dynamic: string | null; revalidate: string | null } {
  const text = read(file);
  return {
    dynamic: text.match(/export const dynamic = ["']([^"']+)["']/)?.[1] ?? null,
    revalidate: text.match(/export const revalidate = ([^;\n]+)/)?.[1]?.trim() ?? null,
  };
}

/** Page, then each ancestor layout, then the root layout. */
function configChain(file: string): string[] {
  const chain = [file];
  let dir = path.posix.dirname(file);
  while (dir.startsWith("src/app")) {
    const layout = `${dir}/layout.tsx`;
    chain.push(layout);
    if (dir === "src/app") break;
    const parent = path.posix.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return chain;
}

describe("H-1-TAPE-SSR AppShell routes are dynamic and AppShell stays a server component", () => {
  const sources = walk("src");
  const importers = sources.filter((file) => /import\s*\{[^}]*\bAppShell\b[^}]*\}\s*from\s*["']@\/components\/AppShell["']/.test(read(file)));

  it("every AppShell importer is a server module", () => {
    expect(importers.length).toBeGreaterThan(0);
    const clients = importers.filter(isClientModule);
    expect(clients).toEqual([]);
    expect(isClientModule("src/components/AppShell.tsx")).toBe(false);
    expect(isClientModule("src/components/ServerTape.tsx")).toBe(false);
  });

  it("no AppShell route is static or ISR", () => {
    const pages = new Set<string>();
    for (const file of importers) {
      if (file.endsWith("/page.tsx")) pages.add(file);
      else {
        const spec = file.replace(/^src\//, "@/").replace(/\.tsx$/, "");
        for (const other of sources) {
          if (other.endsWith("/page.tsx") && read(other).includes(spec)) pages.add(other);
        }
      }
    }
    expect(pages.size).toBeGreaterThanOrEqual(25);
    const root = segmentFlags("src/app/layout.tsx");
    expect(root.dynamic).toBe("force-dynamic");
    expect(root.revalidate).toBe("0");
    const findings: string[] = [];
    for (const page of [...pages].sort()) {
      const chain = configChain(page).filter((file) => sources.includes(file) || file === "src/app/layout.tsx");
      const flags = chain.map((file) => ({ file, ...segmentFlags(file) }));
      const dynamic = flags.some((flag) => flag.dynamic === "force-dynamic" || flag.revalidate === "0");
      const isr = flags.some((flag) => flag.revalidate != null && flag.revalidate !== "0" && flag.revalidate !== "false");
      const frozen = flags.some((flag) => flag.dynamic === "force-static");
      expect(dynamic, page).toBe(true);
      expect(isr, page).toBe(false);
      expect(frozen, page).toBe(false);
      const own = flags[0];
      findings.push(`${page} dynamic=${own.dynamic ?? "inherited"} revalidate=${own.revalidate ?? "inherited"}`);
    }
    expect(findings.join("\n")).not.toMatch(/force-static|revalidate= [1-9]/);
  });
});
