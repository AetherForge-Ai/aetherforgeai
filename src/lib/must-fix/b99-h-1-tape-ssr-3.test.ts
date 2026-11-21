/**
 * H-1-TAPE-SSR-3: a slow or failed live lookup must not blank /markets or /tax.
 * The stored tape (or the build snapshot) is in the first HTML, with prices
 * and a close label, and the client hydrates that same markup.
 */
import { createElement, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tax",
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

const edgeJsonGet = vi.hoisted(() => vi.fn());
const edgeJsonPut = vi.hoisted(() => vi.fn(async () => undefined));
const loadPublicTickerBounded = vi.hoisted(() => vi.fn(async () => null as unknown));
const keepAlive = vi.hoisted(() => vi.fn(async () => "detached" as const));

vi.mock("@/lib/ticker-serve", () => ({
  edgeJsonGet: (...args: unknown[]) => edgeJsonGet(...args),
  edgeJsonPut: (...args: unknown[]) => edgeJsonPut(...args),
}));

vi.mock("@/lib/keep-alive.server", () => ({
  keepAlive: (work: Promise<unknown>) => keepAlive(work),
}));

vi.mock("@/lib/public-ticker", () => ({
  tickerEquityQuotes: vi.fn(async () => []),
  loadPublicTickerBounded: (...args: unknown[]) => loadPublicTickerBounded(...args),
}));

import buildSnapshot from "@/data/tape-build-snapshot.json";
import { ServerTape } from "@/components/ServerTape";
import { formatUnitPrice } from "@/lib/currency";
import { closeLabelFor } from "@/lib/market-freshness";
import { loadRequestTape, quotedTape, SSR_LIVE_WAIT_MS } from "@/lib/tape-ssr";
import type { TickerTapeFeed } from "@/lib/ticker-feed";

/** Sat 14 Nov 2026, 11:00 NZDT. NZX and ASX are shut; Friday's close is 13 Nov. */
const SATURDAY = new Date("2026-11-13T22:00:00.000Z");
const FRI_CLOSE = "2026-11-13T04:00:08Z";

function storedBody(price: number): { body: { ok: true; data: TickerTapeFeed }; headers: Record<string, string>; version: number } {
  const row = (symbol: string, value: number, currency: string) => ({
    symbol,
    name: symbol,
    price: value,
    change: 0.4,
    currency,
    provider: "Yahoo Finance",
    asOf: FRI_CLOSE,
    quotedAt: FRI_CLOSE,
  });
  return {
    body: {
      ok: true,
      data: {
        rows: {
          nzx: [row("FPH.NZ", price, "NZD"), row("AIR.NZ", 0.55, "NZD")],
          asx: [row("BHP.AX", 42.1, "AUD")],
          crypto: [],
        },
        live: { crypto: false, equities: false },
        providers: { equities: "Yahoo Finance", crypto: null },
        asOf: FRI_CLOSE,
      },
    },
    headers: {},
    version: 9,
  };
}

function installDom(html: string): { rootEl: HTMLElement; restore: () => void } {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, {
    url: "https://www.aetherforgeai.co.nz/markets",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const g = globalThis as unknown as Record<string, unknown>;
  const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "DocumentFragment", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const prev = Object.fromEntries(keys.map((key) => [key, g[key]]));
  const assign = (key: string, value: unknown) => {
    const desc = Object.getOwnPropertyDescriptor(g, key);
    if (desc && desc.writable === false && desc.configurable === false) return;
    try {
      g[key] = value;
    } catch {
      /* Node owns a few of these. window still exposes them. */
    }
  };
  assign("window", w);
  assign("document", w.document);
  assign("navigator", w.navigator);
  assign("HTMLElement", w.HTMLElement);
  assign("Element", w.Element);
  assign("Node", w.Node);
  assign("DocumentFragment", w.DocumentFragment);
  assign("getComputedStyle", w.getComputedStyle.bind(w));
  assign("requestAnimationFrame", (cb: FrameRequestCallback) => w.setTimeout(() => cb(0), 0));
  assign("cancelAnimationFrame", (id: number) => w.clearTimeout(id));
  assign("IS_REACT_ACT_ENVIRONMENT", true);
  return {
    rootEl: w.document.getElementById("root") as HTMLElement,
    restore: () => {
      for (const key of keys) {
        try {
          g[key] = prev[key];
        } catch {
          /* leave Node's built-in */
        }
      }
      dom.window.close();
    },
  };
}

describe("H-1-TAPE-SSR-3 cold shell tape", () => {
  beforeEach(() => {
    edgeJsonGet.mockReset();
    edgeJsonGet.mockResolvedValue(null);
    edgeJsonPut.mockReset();
    edgeJsonPut.mockResolvedValue(undefined);
    keepAlive.mockReset();
    loadPublicTickerBounded.mockReset();
    loadPublicTickerBounded.mockResolvedValue(null);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SATURDAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the live wait well under a second", () => {
    expect(SSR_LIVE_WAIT_MS).toBeLessThan(1000);
    expect(readFileSync("src/lib/public-ticker.ts", "utf8")).toMatch(/loadPublicTickerBounded\(ms = 1800\)/);
  });

  it("a slow live lookup still puts prices and a close label in the /markets and /tax tape", async () => {
    expect(readFileSync("src/app/markets/page.tsx", "utf8")).toContain("AppShell");
    expect(readFileSync("src/app/tax/page.tsx", "utf8")).toContain("AppShell");
    loadPublicTickerBounded.mockImplementation(() => new Promise(() => undefined));
    edgeJsonGet.mockImplementation(async (key: string) => (key === "body" ? storedBody(48.54) : null));
    const started = performance.now();
    const element = await ServerTape();
    const html = renderToString(element);
    expect(performance.now() - started).toBeLessThan(SSR_LIVE_WAIT_MS);
    expect(html).toContain("FPH.NZ");
    expect(html).toContain("48.54");
    expect(html).toContain("Close 13 Nov 2026");
    expect(html).not.toContain("Loading prices…");
    expect(html).not.toContain("Close unavailable");
    await expectHydration(element, html);
  });

  it("a failed live lookup still uses the build snapshot", async () => {
    const row = buildSnapshot.rows.nzx.find((item) => item.price >= 5 && item.quotedAt);
    expect(row?.quotedAt).toBeTruthy();
    loadPublicTickerBounded.mockRejectedValue(new Error("cold"));
    const html = renderToString(await ServerTape());
    expect(html).toContain(row!.symbol);
    expect(html).toContain(formatUnitPrice(row!.price, "NZD"));
    expect(html).toContain(closeLabelFor("NZX", row!.quotedAt, SATURDAY));
    expect(html).not.toContain("Loading prices…");
    expect(html).not.toContain("Close unavailable");
  });

  it("a completed background read keeps the 1800ms lookup and fills the colo copy", async () => {
    const src = readFileSync("src/lib/tape-ssr.ts", "utf8");
    expect(src).toMatch(/loadPublicTickerBounded\(\)/);
    expect(src).not.toMatch(/loadPublicTickerBounded\(\s*SSR_LIVE_WAIT_MS\s*\)/);
    expect(src).toMatch(/setTimeout\(\(\) => resolve\(null\), SSR_LIVE_WAIT_MS\)/);
    const colo = new Map<string, unknown>();
    edgeJsonGet.mockImplementation(async (key: string) => colo.get(key) ?? null);
    edgeJsonPut.mockImplementation(async (key: string, value: unknown) => {
      colo.set(key, value);
    });
    let release: (feed: TickerTapeFeed) => void = () => undefined;
    loadPublicTickerBounded.mockImplementation((ms?: number) => {
      expect(ms).toBeUndefined();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = renderToString(await ServerTape());
    expect(loadPublicTickerBounded).toHaveBeenCalledWith();
    expect(first).not.toContain("123.45");
    const freshAt = "2026-11-13T04:00:08Z";
    release({
      rows: {
        nzx: [
          {
            symbol: "FPH.NZ",
            name: "Fisher & Paykel Health",
            price: 123.45,
            change: 0.4,
            currency: "NZD",
            provider: "Yahoo Finance",
            asOf: freshAt,
            quotedAt: freshAt,
          },
        ],
        asx: [
          {
            symbol: "BHP.AX",
            name: "BHP Group",
            price: 42.5,
            change: 0.2,
            currency: "AUD",
            provider: "Yahoo Finance",
            asOf: freshAt,
            quotedAt: freshAt,
          },
        ],
        crypto: [],
      },
      live: { crypto: false, equities: false },
      providers: { equities: "Yahoo Finance", crypto: null },
      asOf: freshAt,
    });
    await vi.waitFor(() => {
      const body = colo.get("body") as { body?: { data?: { rows?: { nzx?: Array<{ price: number }> } } } } | undefined;
      expect(body?.body?.data?.rows?.nzx?.[0]?.price).toBe(123.45);
    });
    const second = renderToString(await ServerTape());
    expect(second).toContain("123.45");
    expect(second).toContain("Close 13 Nov 2026");
    expect(second).not.toContain("Loading prices…");
    expect(quotedTape({ rows: { nzx: [{ symbol: "FPH.NZ", name: "FPH.NZ", price: 10, change: 0, currency: "NZD", provider: "", asOf: "", quotedAt: null }], asx: [], crypto: [] }, live: { crypto: false, equities: false }, providers: { equities: null, crypto: null }, asOf: null })).toBeNull();
  });

  it("keeps the live promise alive when it resolves before the colo read returns", async () => {
    const colo = new Map<string, unknown>();
    let releaseRead: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let heldBody = false;
    edgeJsonGet.mockImplementation(async (key: string) => {
      if (key === "body" && !heldBody) {
        heldBody = true;
        await gate;
      }
      return null;
    });
    edgeJsonPut.mockImplementation(async (key: string, value: unknown) => {
      colo.set(key, value);
    });
    const freshAt = "2026-11-13T04:00:08Z";
    loadPublicTickerBounded.mockResolvedValue({
      rows: {
        nzx: [
          {
            symbol: "FPH.NZ",
            name: "Fisher & Paykel Health",
            price: 77.77,
            change: 0.4,
            currency: "NZD",
            provider: "Yahoo Finance",
            asOf: freshAt,
            quotedAt: freshAt,
          },
        ],
        asx: [
          {
            symbol: "BHP.AX",
            name: "BHP Group",
            price: 42.5,
            change: 0.2,
            currency: "AUD",
            provider: "Yahoo Finance",
            asOf: freshAt,
            quotedAt: freshAt,
          },
        ],
        crypto: [],
      },
      live: { crypto: false, equities: false },
      providers: { equities: "Yahoo Finance", crypto: null },
      asOf: freshAt,
    });
    // The colo read is still waiting. keepAlive must already hold the live promise.
    const pending = loadRequestTape();
    await vi.waitFor(() => {
      expect(keepAlive).toHaveBeenCalledTimes(1);
      const body = colo.get("body") as { body?: { data?: { rows?: { nzx?: Array<{ price: number }> } } } } | undefined;
      expect(body?.body?.data?.rows?.nzx?.[0]?.price).toBe(77.77);
    });
    const held = keepAlive.mock.calls[0][0] as Promise<unknown>;
    expect(held).toBeInstanceOf(Promise);
    releaseRead();
    const tape = await pending;
    await held;
    expect(tape?.rows.nzx[0]?.price).toBe(77.77);
  });

  it("jsdom stays a devDependency and out of the server graph", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.jsdom).toBeTruthy();
    expect(pkg.dependencies?.jsdom).toBeUndefined();
    expect(readFileSync("src/lib/tape-ssr.ts", "utf8")).not.toContain("jsdom");
    expect(readFileSync("src/components/ServerTape.tsx", "utf8")).not.toContain("jsdom");
    expect(readFileSync("scripts/refresh-tape-snapshot.mjs", "utf8")).toContain("keeping the last committed file");
    expect(buildSnapshot.source).toContain("Yahoo Finance spark");
    for (const row of [...buildSnapshot.rows.nzx, ...buildSnapshot.rows.asx, ...buildSnapshot.rows.crypto]) {
      expect(row.price).toBeGreaterThan(0);
      expect(row.quotedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

async function expectHydration(element: ReactElement, html: string) {
  const { rootEl, restore } = installDom(html);
  const errors: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  let root: Root | undefined;
  try {
    const { act } = await import("react");
    await act(async () => {
      root = hydrateRoot(rootEl, element);
    });
    expect(errors.join("\n")).not.toMatch(/hydration|did not match|server rendered/i);
    expect(rootEl.textContent).toContain("Close 13 Nov 2026");
    expect(rootEl.textContent).toContain("48.54");
    expect(rootEl.textContent).not.toContain("Loading prices…");
  } finally {
    if (root) root.unmount();
    spy.mockRestore();
    restore();
  }
}
