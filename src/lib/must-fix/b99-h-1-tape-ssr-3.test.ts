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
const loadPublicTickerBounded = vi.hoisted(() => vi.fn(async () => null as unknown));

vi.mock("@/lib/ticker-serve", () => ({
  edgeJsonGet: (...args: unknown[]) => edgeJsonGet(...args),
}));

vi.mock("@/lib/public-ticker", () => ({
  tickerEquityQuotes: vi.fn(async () => []),
  loadPublicTickerBounded: (...args: unknown[]) => loadPublicTickerBounded(...args),
}));

import { ServerTape } from "@/components/ServerTape";
import { SSR_LIVE_WAIT_MS } from "@/lib/tape-ssr";
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
    loadPublicTickerBounded.mockRejectedValue(new Error("cold"));
    const html = renderToString(await ServerTape());
    expect(html).toContain("FPH.NZ");
    expect(html).toContain("36.20");
    expect(html).toContain("Close 13 Nov 2026");
    expect(html).not.toContain("Loading prices…");
    expect(html).not.toContain("Close unavailable");
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
