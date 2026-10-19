// b41 goal test (version guard moved to goal-b42)
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasteReviewTable, PasteTradesBox } from "@/components/import/PasteTradesBox";
import { isSessionTokenRevoked, markSessionTokenRevoked, resetSessionRevocationForTests } from "@/lib/session-revocation";
import { PASTE_COLUMN_MAP, parsePastedTrades, pastedRowNzd, pastedRowsToCsv } from "@/lib/paste-import";
import { AUTH_COOKIE_NAMES } from "@/lib/session-owner";

const read = (p: string) => readFileSync(p, "utf8");

describe("b41 P1: Sign out cannot be cancelled by a fast navigation", () => {
  afterEach(() => {
    resetSessionRevocationForTests();
    vi.unstubAllGlobals();
  });

  it("a signed-out token is rejected even while another isolate's session cache holds it", async () => {
    expect(await isSessionTokenRevoked("tok-a")).toBe(false);
    await markSessionTokenRevoked("tok-a");
    expect(await isSessionTokenRevoked("tok-a")).toBe(true);
    expect(await isSessionTokenRevoked("tok-b")).toBe(false);
  });

  it("the revocation is shared through the colo cache (a fresh isolate sees it)", async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        put: async (url: string, res: Response) => void store.set(url, res),
        match: async (url: string) => store.get(url),
      },
    });
    await markSessionTokenRevoked("tok-c");
    expect([...store.keys()][0]).toMatch(/^https:\/\/af-internal\.invalid\/session-revoked\/[0-9a-f]{64}$/);
    expect([...store.keys()][0]).not.toContain("tok-c");
    resetSessionRevocationForTests(); // new isolate: memory empty, cache keeps the marker
    expect(await isSessionTokenRevoked("tok-c")).toBe(true);
  });

  it("readTokenSession checks revocation before any cache hit; logout marks it and expires af_ls too", () => {
    const session = read("src/lib/session.ts");
    const at = session.indexOf("await isSessionTokenRevoked(token)");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(session.indexOf("sessionCache.get(key)"));
    expect(read("src/app/api/session/logout/route.ts")).toMatch(/revokeTokenEverywhere\(ctx, token\)/);
    expect(AUTH_COOKIE_NAMES).toContain("af_ls");
  });

  it("the Sign out click awaits the POST (keepalive, one retry; b43 overlay) before navigating", async () => {
    const order: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      order.push(`fetch ${url} ${init.method} keepalive=${init.keepalive}`);
      await new Promise((r) => setTimeout(r, 20));
      order.push("fetch done");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("navigator", { sendBeacon: () => (order.push("beacon"), true) });
    vi.stubGlobal("window", { location: { replace: () => undefined } });
    const { signOutNow } = await import("@/lib/sign-out");
    await signOutNow({ navigate: (u) => order.push(`go ${u}`) });
    expect(order).toEqual(["fetch /api/session/logout POST keepalive=true", "fetch done", "go /login"]);

    order.length = 0;
    vi.stubGlobal("fetch", async () => {
      order.push("try");
      throw new Error("aborted");
    });
    await signOutNow({ navigate: (u) => order.push(`go ${u}`) });
    expect(order).toEqual(["try", "try", "go /logout"]);
    const nav = read("src/components/TopNav.tsx");
    expect(nav.match(/href="\/logout" onClick=\{onSignOutClick\}/g)).toHaveLength(2);
  });

  it("/settings is server-checked and never cached", () => {
    expect(read("src/app/settings/page.tsx")).toMatch(/export const dynamic = "force-dynamic"/);
    expect(read("src/middleware.ts")).toMatch(/\/settings/);
  });
});

describe("b41 G-24: review table, blank required dates, Cancel, mapper skipped", () => {
  const rows = parsePastedTrades(
    ["Bought 30 CEN.NZ at NZ$9.10", "You sold 10 AIR.NZ @ $0.62 on 13/10/2026, fees $2.50", "Dividend paid AAPL US$1.25 on 22 Sep 2026 (withholding US$0.19)"].join("\n")
  ).rows;

  it("an undated row is blank (never today's date) and the CSV leaves it empty", () => {
    expect(rows[0].date).toBeNull();
    expect(pastedRowsToCsv(rows).split("\n")[1].startsWith(",Buy,CEN.NZ")).toBe(true);
  });

  it("renders every column, a required blank date, a not-held sell and the dividend tax", () => {
    const html = renderToStaticMarkup(
      createElement(PasteReviewTable, { rows, rowDates: {}, onRowDate: () => undefined, held: new Set<string>(), rates: { NZD: 1, USD: 1.7 } })
    );
    for (const h of ["Date", "Side", "Ticker", "Quantity", "Price", "Currency", "Fee", "NZ$ total"]) expect(html).toContain(`>${h}</th>`);
    expect(html).toMatch(/type="date" required="" aria-required="true"[^>]*value=""/);
    expect(html).toContain("Date missing");
    expect(html).toContain("data-paste-not-held");
    expect(html).toContain("tax 0.19");
    expect(html).toContain("NZ$273.00"); // 30 × 9.10
  });

  it("NZ$ totals: buys add the fee, sells take it off, dividends are net of tax", () => {
    expect(pastedRowNzd(rows[1], null)).toBe(3.7); // 10 × 0.62 − 2.50
    expect(pastedRowNzd(rows[2], { USD: 2 })).toBe(2.12);
    expect(pastedRowNzd(rows[2], null)).toBeNull();
  });

  it("the box has Cancel, blocks review until dates are set, and sends its column map", () => {
    const box = read("src/components/import/PasteTradesBox.tsx");
    expect(box).toMatch(/data-paste-cancel/);
    expect(box).toMatch(/disabled=\{missing > 0\}/);
    expect(box).toMatch(/PASTE_COLUMN_MAP\)/);
    expect(box).not.toMatch(/nzToday/);
    expect(renderToStaticMarkup(createElement(PasteTradesBox, { onCsv: () => undefined }))).toContain("data-paste-trades");
    expect(read("src/app/import/import-client.tsx")).toMatch(/send\("preview", csv, columnMap\)/);
    expect(read("src/components/dashboard/HoldingsCsvImport.tsx")).toMatch(/initialMapping=\{pasteMapping\}/);
    expect(read("src/components/import/BrokerImportPanel.tsx")).toMatch(/disabled=\{busy \|\| !text\.trim\(\) \|\| pastedDatesMissing > 0\}/);
    expect(Object.values(PASTE_COLUMN_MAP)).toEqual(expect.arrayContaining(["Date", "Type", "Ticker", "Quantity", "Price", "Currency", "Fees"]));
  });
});

describe("b41 H-1: the snapshot cannot freeze while a source answers; refusals are named", async () => {
  const { mergeStaleCryptoList, countMergeableRows } = await import("@/lib/crypto-row-delay");
  const { recordCryptoAttempt, attemptLabel } = await import("@/lib/crypto-attempts");
  const coin = (symbol: string, price: number, quotedAt: string | null = null, id = symbol.toLowerCase()) =>
    ({ id, symbol, name: symbol, price, change24h: 0, marketCap: 1, quotedAt, source: "coingecko" }) as never;
  const saved = { at: "2026-10-19T00:00:00.000Z", coins: [coin("BTC", 1, "2026-10-19T00:00:00.000Z"), coin("ETH", 2, "2026-10-19T00:00:00.000Z")] };

  it("per-row checks: bad price, future time and unknown ids are skipped; good rows merge", () => {
    const at = "2026-10-19T00:12:00.000Z";
    const merged = mergeStaleCryptoList(saved, [coin("BTC", 5, at), coin("ETH", 0, at), coin("ZZZ", 9, at)], at)!;
    expect(merged.map((c: { price: number }) => c.price)).toEqual([5, 2]);
    expect(mergeStaleCryptoList(saved, [coin("BTC", 5, "2026-10-19T01:00:00.000Z")], at)).toBeNull();
    expect(countMergeableRows(saved, [coin("BTC", 5), coin("ZZZ", 1)])).toBe(1);
  });

  it("a verified shorter list merges after 10 min instead of waiting for the 15-min band", () => {
    const src = read("src/lib/crypto-snapshot.ts");
    expect(src).toMatch(/existingAge > CRYPTO_PARTIAL_REFRESH_AFTER_MS \? mergeStaleCryptoList\(existing, tagged, at\)/);
    expect(src).toMatch(/guardDetail\("shorter"/);
    expect(src).toMatch(/guardDetail\("unverified"/);
    // Every fresh list reaches the store (the old "verified only" gate hid the partial path).
    expect(read("src/lib/crypto-source.ts")).toMatch(/if \(selected\.reason !== "saved" && selected\.coins\.length\) \{\s*await persistCryptoSnapshot/);
  });

  it("/status names the check, source, counts and refusals in a row", () => {
    recordCryptoAttempt(false, new Error("unavailable: list not verified"), Date.now(), "check=unverified source=yahoo rows=11/400 mergeable=11 savedAge=120s");
    const a = recordCryptoAttempt(false, new Error("unavailable: list not verified"), Date.now(), "check=unverified source=yahoo rows=11/400 mergeable=11 savedAge=180s");
    expect(attemptLabel(a)).toMatch(/\[check=unverified source=yahoo rows=11\/400 mergeable=11 savedAge=180s refusedInARow=2\]$/);
    expect(recordCryptoAttempt(true).detail).toBeUndefined();
  });

  it("the build no longer answers 503 itself; the fallback snapshot read gets its full time", () => {
    const route = read("src/app/api/ticker/route.ts");
    expect(route).toMatch(/if \(!snap\) return null;/); // b45
    expect(route).toMatch(/firstNonNull\(/); // b46: first ready reply within the budget
    expect(route.match(/stampTicker\(noCopyResponse\(\)/g)).toHaveLength(1); // b48: stamped with x-af-503-reason
  });

  it("P3: equities merge per symbol and survive a missed fetch; /status has more time sources", () => {
    const t = read("src/lib/public-ticker.ts");
    expect(t).toMatch(/lastGoodEquity = \{ \.\.\.\(lastGoodEquity \?\? \{\}\), \.\.\.equityFresh \}/);
    expect(t).toMatch(/await edgeEquityGet\(\)/);
    const st = read("src/lib/status-feeds.server.ts");
    expect(st).toMatch(/lastGoodEquityAt\(\)/);
    expect(st).toMatch(/localCryptoAttemptRow\(\)/);
  });
});
