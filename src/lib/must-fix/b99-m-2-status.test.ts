// b99 candidate: M-2-STATUS
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { quotesFromCoins } from "@/lib/crypto-board-store";
import { DOCS_GUIDES, docsShot } from "@/lib/docs-guides";
import { DOC_LINKS } from "@/lib/help-index";
import { FEED_FRESHNESS_WINDOWS } from "@/lib/feed-freshness-hook";
import {
  buildStatusLastOk,
  cryptoQuotedAtServedByTicker,
  latestIso,
  NO_SAVED_TIME_YET,
  statusLastOkLine,
  type StatusLastOkLine,
} from "@/lib/status-feeds";
import { TICKER_TAPE } from "@/lib/ticker-feed";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

/** 10 Nov 2026, 7:03:00 am NZDT. */
const NOW = Date.parse("2026-11-09T18:03:00.000Z");
/** Newest crypto quotedAt: 10 Nov 2026, 7:00:19 am NZDT. */
const QUOTED_AT = "2026-11-09T18:00:19.000Z";
/** Older snapshot stamp: 10 Nov 2026, 6:39:00 am NZDT. */
const OLD_STAMP = "2026-11-09T17:39:00.000Z";

const HEX_HASH = /\b[0-9a-f]{7,40}\b/i;

function line(lines: StatusLastOkLine[], label: string): StatusLastOkLine {
  const found = lines.find((row) => row.label === label);
  expect(found, label).toBeTruthy();
  return found!;
}

describe("M-2-STATUS 1: crypto Last OK matches the ticker quotedAt", () => {
  const coins = [
    { symbol: "BTC", price: 100_000, quotedAt: QUOTED_AT, change24h: 0.2 },
    { symbol: "ETH", price: 2_000, quotedAt: OLD_STAMP, change24h: -0.1 },
    { symbol: "SOL", price: 150, quotedAt: null, change24h: 0 },
  ];

  it("uses the newest ticker quotedAt (7:00 am), not the older snapshot stamp", () => {
    const tickerQuotes = quotesFromCoins(coins as never, OLD_STAMP, TICKER_TAPE.crypto.map((row) => row.symbol));
    const tickerAt = latestIso(Object.values(tickerQuotes).map((quote) => quote.quotedAt));
    expect(tickerAt).toBe(QUOTED_AT);
    expect(cryptoQuotedAtServedByTicker(coins, OLD_STAMP)).toBe(tickerAt);

    const crypto = line(buildStatusLastOk({ cryptoCoins: coins, cryptoSnapshotAt: OLD_STAMP }, NOW), "Crypto quotes");
    expect(crypto.at).toBe(tickerAt);
    expect(Math.abs(Date.parse(crypto.at!) - Date.parse(tickerAt!))).toBeLessThanOrEqual(60_000);
    expect(crypto.body).toMatch(/^Last OK /);
    expect(crypto.body).toContain("7:00 am");
    expect(crypto.body).toContain("NZDT");
    expect(crypto.body).not.toContain("older than 15 minutes");

    const wrongStamp = statusLastOkLine("Crypto quotes", OLD_STAMP, NOW, "freshness", FEED_FRESHNESS_WINDOWS.crypto);
    expect(wrongStamp.body).toContain("6:39 am");
    expect(wrongStamp.body).toContain("older than 15 minutes");
  });
});

describe("M-2-STATUS 2: every feed has a Last OK line in NZ time, or an honest empty state", () => {
  const fresh = new Date(NOW - 60_000).toISOString();

  it("lists NZX, ASX, crypto, DEX, FX, metals and the AI guide", () => {
    const lines = buildStatusLastOk(
      {
        cryptoCoins: [{ symbol: "BTC", price: 1, quotedAt: fresh }],
        equityQuotes: [
          { symbol: "FPH.NZ", quotedAt: fresh, price: 20, changePct: 0.1 },
          { symbol: "BHP.AX", quotedAt: fresh, price: 40, changePct: -0.2 },
        ],
        dexAt: fresh,
        fxFetchedAt: fresh,
        fxAsOf: OLD_STAMP,
        metalsQuotedAt: fresh,
        aiCheckedAt: fresh,
      },
      NOW,
    );
    expect(lines.map((row) => row.label)).toEqual([
      "NZX shares",
      "ASX shares",
      "Crypto quotes",
      "DEX tokens",
      "Exchange rates",
      "Metals spot",
      "AI guide",
    ]);
    for (const row of lines) {
      expect(row.body, row.label).toMatch(/^Last OK /);
      expect(row.body, row.label).toMatch(/NZDT|NZST/);
      expect(row.body, row.label).not.toMatch(/undefined/);
      expect(row.at, row.label).toBeTruthy();
    }
    const fx = line(lines, "Exchange rates");
    expect(fx.at).toBe(fresh);
  });

  it("a feed with no stamp says no saved time yet", () => {
    const lines = buildStatusLastOk({}, NOW);
    expect(lines).toHaveLength(7);
    for (const row of lines) {
      expect(row.at, row.label).toBeNull();
      expect(row.body, row.label).toBe(NO_SAVED_TIME_YET);
      expect(row.body).toContain("no saved time yet");
      expect(row.body).not.toMatch(/undefined/);
      expect(row.body.trim()).not.toBe("");
    }
  });
});

describe("M-2-STATUS 3: NZX and ASX Last OK come from the stored quote time", () => {
  it("shows each venue's saved quotedAt when the ticker has no row yet", () => {
    const nzxAt = "2026-11-09T17:00:00.000Z";
    const asxAt = "2026-11-09T16:30:00.000Z";
    const lines = buildStatusLastOk(
      {
        savedEquityQuotes: [
          { symbol: "FPH.NZ", quotedAt: nzxAt, price: 30, changePct: 0.4 },
          { symbol: "BHP.AX", quotedAt: asxAt, price: 40, changePct: -0.2 },
        ],
      },
      NOW,
    );
    const nzx = line(lines, "NZX shares");
    const asx = line(lines, "ASX shares");
    expect(nzx.at).toBe(nzxAt);
    expect(asx.at).toBe(asxAt);
    expect(nzx.body).toMatch(/^Last OK /);
    expect(asx.body).toMatch(/^Last OK /);
    expect(nzx.body).toContain("6:00 am");
    expect(asx.body).toContain("5:30 am");
    expect(nzx.body).toContain("NZDT");
    expect(asx.body).toContain("NZDT");
  });

  it("prefers the ticker's quotedAt when both a served quote and a saved print exist", () => {
    const served = QUOTED_AT;
    const lines = buildStatusLastOk(
      {
        equityQuotes: [{ symbol: "AIR.NZ", quotedAt: served, price: 1, changePct: 0.2 }],
        savedEquityQuotes: [{ symbol: "AIR.NZ", quotedAt: OLD_STAMP, price: 1, changePct: 0.2 }],
      },
      NOW,
    );
    const nzx = line(lines, "NZX shares");
    expect(nzx.at).toBe(served);
    expect(Math.abs(Date.parse(nzx.at!) - Date.parse(served))).toBeLessThanOrEqual(60_000);
    expect(line(lines, "ASX shares").body).toBe(NO_SAVED_TIME_YET);
  });
});

describe("M-2-STATUS 4–6: /help, /changelog and /docs", () => {
  it("/help renders admin@aetherforgeai.co.nz as visible text", () => {
    const src = read("src/app/help/page.tsx");
    const visible = src.slice(src.indexOf("export default")).replace(/<[^>]+>/g, "");
    expect(visible).toContain("admin@aetherforgeai.co.nz");
    expect(src).not.toMatch(/mailto:/);
  });

  it("/changelog page source has no 7–40 character hex commit hashes", () => {
    const src = ["src/app/changelog/page.tsx", "src/lib/changelog-entries.ts"]
      .map(read)
      .join("\n")
      .replace(/\/_next\/[^\s"'`)<>]*/g, "");
    expect(src).not.toMatch(HEX_HASH);
  });

  it("/docs lists 6+ guides, each with an image alt, and internal links resolve", () => {
    expect(DOCS_GUIDES.length).toBeGreaterThanOrEqual(6);
    const guidePage = read("src/app/docs/[slug]/page.tsx");
    expect(guidePage).toMatch(/alt=\{docsShot\(guide\.slug\)!\.alt\}/);
    expect(read("src/app/docs/page.tsx")).toContain("DOCS_GUIDES");
    for (const guide of DOCS_GUIDES) {
      const shot = docsShot(guide.slug);
      expect(shot, guide.slug).not.toBeNull();
      expect(shot!.alt.trim().length, guide.slug).toBeGreaterThan(0);
      expect(existsSync(path.join(process.cwd(), "public", shot!.src)), shot!.src).toBe(true);
    }

    const routes = appRoutes(path.join(process.cwd(), "src/app"));
    const hrefs = new Set<string>(DOCS_GUIDES.map((guide) => `/docs/${guide.slug}`));
    for (const link of DOC_LINKS) hrefs.add(link.href);
    for (const file of ["src/app/docs/page.tsx", "src/app/docs/[slug]/page.tsx", "src/lib/docs-guides.ts"]) {
      for (const href of hrefsIn(read(file))) hrefs.add(href);
    }
    const broken = [...hrefs].filter((href) => !routeResolves(href, routes));
    expect(broken).toEqual([]);
  });
});

describe("M-2-STATUS wiring", () => {
  it("the status page builds Last OK from the ticker quote time", () => {
    const server = read("src/lib/status-feeds.server.ts");
    expect(server).toContain("cryptoQuotedAtServedByTicker");
    expect(server).toContain("venueLastOkAt");
    expect(server).toContain('statusLastOkLine("NZX shares"');
    expect(server).toContain('statusLastOkLine("ASX shares"');
    expect(read("src/app/status/page.tsx")).toContain('statusLastOkLine("AI guide"');
  });
});

function hrefsIn(src: string): string[] {
  const found: string[] = [];
  for (const match of src.matchAll(/href(?:=|:)\s*["'](\/[^"'#?\s]+)/g)) found.push(match[1]);
  return found;
}

function appRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith("(") && entry.name.endsWith(")") ? "" : entry.name;
      routes.push(...appRoutes(full, segment ? `${prefix}/${segment}` : prefix));
    } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
      routes.push(prefix || "/");
    }
  }
  return routes;
}

function routeResolves(href: string, routes: string[]): boolean {
  const concrete = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (concrete.startsWith("/docs/") && !DOCS_GUIDES.some((guide) => `/docs/${guide.slug}` === concrete)) return false;
  if (routes.includes(concrete)) return true;
  return routes.some((route) => {
    const pattern = route
      .split("/")
      .map((segment) => (segment.startsWith("[") && segment.endsWith("]") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    return new RegExp(`^${pattern}$`).test(concrete);
  });
}
