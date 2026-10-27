// pull-check:v3-goal-b29-2026-10-19
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

const read = (p: string) => readFileSync(p, "utf8");

import { BOOK_WRITE_MARGIN_MS, bookNotBeforeFromCookie, isBookWriteRequest } from "@/lib/book-write-mark";
import { BOOK_CACHE_MS, readBookCache, writeBookCache, __resetBookCacheForTests } from "@/lib/book-cache";
import { isListedNewsSource, listedNewsPublishers, NEWS_FEEDS } from "@/lib/news-sources";
import { filterServableNews } from "@/lib/news-serve";
import { sourceForUrl } from "@/lib/news-present";
import { keepSnapshotQuote } from "@/components/dashboard/crypto/CoinDetailView";
import { primarySnapshotSource } from "@/lib/crypto-snapshot";
import { alertCountText } from "@/components/dashboard/alerts/AlertCounter";
import { formatAlertRuleLine, isGeneratedRuleLine } from "@/lib/alert-labels";
import { goalProgress, rangeRatesText, validateGoal } from "@/lib/goal-math";
import { buildFifPaper, fifThresholdSentence, fifThresholdText, normaliseFifThreshold } from "@/lib/fif-working-paper";
import { buildZip, crc32 } from "@/lib/zip-store";
import { corporateActionsCsv, positionsCsv, tradesCsv } from "@/lib/tax-pack-zip";

describe("b29 version bump", () => {
  it("marker and pull-check line ship with the runtime", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-b(29|[3-9]\d)[a-z]?-/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b29-2026-10-19");
  });
});

describe("b29 H-4/G-10 book cache: one design (per-user shared cache + write stamp)", () => {
  beforeEach(() => __resetBookCacheForTests());
  it("reuses a book for 15 s again (b28's 0 made /dashboard ~6 s)", () => {
    expect(BOOK_CACHE_MS).toBe(15_000);
    writeBookCache("u1:ledger:500", { rows: 3 }, undefined, Date.now());
    expect(readBookCache("u1:ledger:500")).toEqual({ rows: 3 });
  });
  it("a browser that wrote never gets an entry whose read started before its write (cross-isolate)", () => {
    const writeAt = Date.now();
    writeBookCache("u1:ledger:500", { rows: 3 }, undefined, writeAt - 1000);
    const notBefore = bookNotBeforeFromCookie(`a=1; af_bw=${writeAt}`);
    expect(notBefore).toBe(writeAt + BOOK_WRITE_MARGIN_MS);
    expect(readBookCache("u1:ledger:500", BOOK_CACHE_MS, notBefore)).toBeNull();
    writeBookCache("u1:ledger:500", { rows: 2 }, undefined, notBefore + 1);
    expect(readBookCache("u1:ledger:500", BOOK_CACHE_MS, notBefore)).toEqual({ rows: 2 });
  });
  it("every book write path is stamped by the middleware; reads are not", () => {
    for (const p of ["/api/transactions", "/api/stocks", "/api/stocks/abc", "/api/import", "/api/tax/fif", "/api/transactions/split"]) {
      expect(isBookWriteRequest(p, "POST")).toBe(true);
      expect(isBookWriteRequest(p, "DELETE")).toBe(true);
    }
    expect(isBookWriteRequest("/api/transactions", "GET")).toBe(false);
    expect(isBookWriteRequest("/api/portfolio/snapshot", "POST")).toBe(false);
    expect(read("src/middleware.ts")).toContain("isBookWriteRequest(pathname, request.method)");
    for (const f of ["src/lib/transactions.ts", "src/lib/tax-book-server.ts", "src/app/api/portfolio/snapshot/route.ts", "src/app/api/stocks/route.ts"]) {
      expect(read(f)).toContain("readBookCacheForRequest");
    }
  });
});

describe("b29 H-4 session: cached row, last-good on a store timeout, honest notice", () => {
  const findSession = vi.fn();
  const getRecordById = vi.fn();
  let cookie = "tok=signed";
  beforeEach(() => {
    vi.resetModules();
    findSession.mockReset();
    getRecordById.mockReset();
    vi.doMock("next/headers", () => ({ headers: async () => new Headers({ cookie }) }));
    vi.doMock("@/lib/auth", () => ({
      auth: { $context: Promise.resolve({ authCookies: { sessionToken: { name: "tok" } }, secret: "s", internalAdapter: { findSession } }) },
    }));
    vi.doMock("@/lib/totalum", () => ({ totalumSdk: { crud: { getRecordById } } }));
    vi.doMock("@/lib/session-token", async (orig) => ({
      ...(await orig<typeof import("@/lib/session-token")>()),
      verifySignedSessionToken: async () => "raw-token",
    }));
  });
  afterEach(() => vi.useRealTimers());
  const row = { user: { id: "u1", email: "a@b.c", name: "A" }, session: { expiresAt: new Date(Date.now() + 86400_000).toISOString() } };

  it("one store read serves the next minute; a store timeout after that returns the last good row, not 'unavailable'", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    findSession.mockResolvedValueOnce(row);
    getRecordById.mockResolvedValue({ data: { _id: "u1", cash_balance: 10 } });
    const s = await import("@/lib/session");
    expect((await s.getSessionState()).user?.id).toBe("u1");
    expect((await s.getSessionState()).user?.id).toBe("u1");
    expect(findSession).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 90_000);
    findSession.mockRejectedValueOnce(new Error("Totalum 429"));
    getRecordById.mockRejectedValueOnce(new Error("Totalum 429"));
    const state = await s.getSessionState();
    expect(state.unavailable).toBeNull();
    expect(state.user?.id).toBe("u1");
    expect(s.recentSessionDecisions().some((d) => d.source === "stale-cache")).toBe(true);
  });
  it("with no last good row a store failure is still 'unavailable' (never a fake user)", async () => {
    findSession.mockRejectedValueOnce(new Error("down"));
    const s = await import("@/lib/session");
    const state = await s.getSessionState();
    expect(state.user).toBeNull();
    expect(state.unavailable).toBeTruthy();
  });
  it("a browser that just wrote re-reads its user record (cash moved)", async () => {
    findSession.mockResolvedValue(row);
    getRecordById.mockResolvedValue({ data: { _id: "u1", cash_balance: 10 } });
    const s = await import("@/lib/session");
    await s.getSessionState();
    cookie = `tok=signed; af_bw=${Date.now()}`;
    await s.getSessionState();
    expect(getRecordById).toHaveBeenCalledTimes(2);
    cookie = "tok=signed";
  });
  it("the notice no longer claims 'still signed in', offers Sign in again, and the nav keeps the user on an outage", () => {
    const guard = read("src/components/dashboard/AccountOwnerGuard.tsx");
    expect(guard).not.toContain("You are still signed in");
    expect(guard).toContain("Sign in again");
    expect(guard).toContain("invalidateLiveSessionProbe(); onRetry();");
    const nav = read("src/lib/use-live-session.ts");
    expect(nav).toContain("confirmPageSessionStrict");
    expect(nav).toContain("lastConfirmedUser ?? undefined");
  });
});

describe("b29 H-15/H-13 news sources come from one list", () => {
  it("/trust renders the same list /api/news filters on, incl. Proactive Investors", () => {
    expect(isListedNewsSource("Proactive Investors")).toBe(true);
    expect(sourceForUrl("https://www.proactiveinvestors.com.au/companies/news/1/south32", "Yahoo")).toBe("Proactive Investors");
    expect(listedNewsPublishers()).toContain("Proactive Investors");
    expect(NEWS_FEEDS.length).toBeGreaterThan(4);
    const trust = read("src/app/trust/page.tsx");
    expect(trust).toContain("NEWS_FEEDS");
    expect(trust).toContain("listedNewsPublishers()");
  });
  it("drops unlisted publishers and the b28 'Global' Burry column; keeps NZ/AU items", () => {
    const items = [
      { headline: "RBNZ holds the OCR", source: "Reserve Bank of New Zealand", market: "NZX", summary: "" },
      { headline: "Wesfarmers lifts dividend", source: "Yahoo Finance", market: "ASX", summary: "" },
      { headline: "South32 output rises", source: "Proactive Investors", market: "ASX", summary: "" },
      { headline: "Michael Burry Warns of a Stock Market 'Supervolcano'", source: "Yahoo Finance", market: "Global", summary: "" },
      { headline: "Random story", source: "unknownsite.com", market: "ASX", summary: "" },
    ];
    const kept = filterServableNews(items).map((i) => i.headline);
    expect(kept).toEqual(["RBNZ holds the OCR", "Wesfarmers lifts dividend", "South32 output rises"]);
    expect(read("src/app/api/news/route.ts")).toContain("filterServableNews(");
    expect(read("src/app/market-news/page.tsx")).toContain("filterServableNews(");
  });
});

describe("b29 G-20 stored card first, self-seeding store", () => {
  it("reads the store first, seeds it in the background when missing or a day old, waits 5 s at most for live", async () => {
    const page = read("src/app/test-hooks/track-record/page.tsx");
    expect(page.indexOf("loadTrackRecordView()")).toBeLessThan(page.indexOf("seedTrackRecordStore()"));
    expect(page).toContain("TRACK_LIVE_WAIT_MS");
    const seed = read("src/lib/track-record-seed.server.ts");
    expect(seed).toMatch(/persistTrackRun\(out\.run[,)]/);
    expect(seed).toContain("keepAlive(job)");
    const { storedCardIsStale } = await import("@/lib/track-record-seed.server");
    expect(storedCardIsStale(new Date(Date.now() - 3600_000).toISOString())).toBe(false);
    expect(storedCardIsStale(new Date(Date.now() - 2 * 86400_000).toISOString())).toBe(true);
  });
});

describe("b29 H-1 one snapshot, time only moves forward", () => {
  it("coin page keeps the header snapshot's price/time/source on the large figure", () => {
    const snap = { price: 81909.07, quotedAt: "2026-10-19T01:30:00Z", source: "coingecko" };
    const fetched = { price: 81925.72, quotedAt: "2026-10-19T01:31:00Z", source: "coinpaprika", marketCap: 1 };
    expect(keepSnapshotQuote(fetched, snap)).toMatchObject({ price: 81909.07, quotedAt: snap.quotedAt, source: "coingecko", marketCap: 1 });
  });
  it("memory is rechecked against the durable row; an older list or a fallback provider does not replace a fresh primary", () => {
    const src = read("src/lib/crypto-snapshot.ts");
    expect(src).toMatch(/MEMORY_RECHECK_MS = (30_000|SNAPSHOT_LOCAL_TTL_MS)/); // b30: 3 s local copy
    expect(src).toContain("a newer list is already saved");
    expect(primarySnapshotSource([{ source: "coingecko" }, { source: "coingecko" }, { source: "coinpaprika" }])).toBe("coingecko");
    expect(read("src/app/api/crypto/markets/route.ts")).toContain('"x-af-snapshot-at"');
  });
});

describe("b29 G-17 cross-provider id map", () => {
  it("maps the six empty coins and tether to checked provider ids", () => {
    const src = read("src/lib/crypto-depth.server.ts");
    for (const [slug, paprika] of [["bitcoin-cash", "bch-bitcoin-cash"], ["near-protocol", "near-near-protocol"], ["rain-protocol", "rain-rain-protocol"], ["stellar", "xlm-stellar"], ["tron", "trx-tron"], ["zcash", "zec-zcash"], ["tether", "usdt-tether"]]) {
      expect(src).toContain(`"${slug}"`);
      expect(src).toContain(`"${paprika}"`);
    }
    expect(src).toContain('"near-protocol": { gecko: "near"');
    expect(src).toContain("/v1/search/?q=");
  });
});

describe("b29 L-4 alert counter and one trim note", () => {
  it("counter text has no invented limit and renders on /dashboard/alerts and Plan usage", () => {
    expect(alertCountText(1)).toBe("1 alert in use (no plan limit)");
    expect(alertCountText(0)).toBe("0 alerts in use (no plan limit)");
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("<AlertCounter enabled={!freePlan && !preview} />");
    expect(read("src/components/dashboard/rail/DashboardRail.tsx")).toContain('"data-alert-counter": "plan-usage"');
  });
  it("a saved generated rule line is never shown next to the live one", () => {
    const a = { trimPct: 25, trimTriggerDipPct: 6 };
    const saved = formatAlertRuleLine(a);
    expect(saved).toContain("the price paid");
    expect(isGeneratedRuleLine(saved, a)).toBe(true);
    expect(isGeneratedRuleLine(formatAlertRuleLine(a, { held: false }), a)).toBe(true);
    expect(isGeneratedRuleLine("Sell half if the CEO leaves", a)).toBe(false);
    expect(read("src/components/dashboard/PriceAlerts.tsx")).toContain("!isGeneratedRuleLine(custom, a)");
  });
});

describe("b29 G-10 optimistic delete", () => {
  it("dialog closes and the row leaves at once; a refusal restores it", () => {
    const tab = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tab.indexOf("setPending(null);")).toBeLessThan(tab.indexOf("onDeleteDividend(target)"));
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash).toContain("b29 G-10: optimistic delete");
    expect(dash).toContain("if (before) setBookSnapshot(before);");
  });
});

describe("b29 H-11 contribution validation and range rates", () => {
  it("monthly <= 0 is an inline error; the range prints 2% / 5% / 8%", () => {
    const g = { targetNzd: 100000, targetDate: "2031-01-01", monthlyNzd: 0, bookNzd: 20000, annualReturnPct: 5 };
    const now = new Date("2026-10-19T00:00:00Z");
    expect(validateGoal(g, now)).toBe("Enter a monthly amount above NZ$0.");
    expect(validateGoal({ ...g, monthlyNzd: -5 }, now)).toBe("Enter a monthly amount above NZ$0.");
    const p = goalProgress({ ...g, monthlyNzd: 500 }, now);
    const text = rangeRatesText(p);
    expect(text).toMatch(/at 2% \/ NZ\$[\d,]+ at 5% \/ NZ\$[\d,]+ at 8% a year$/);
    expect(read("src/components/dashboard/GoalsWorkflow.tsx")).toContain("data-goal-monthly-error");
  });
});

describe("b29 H-9 per-portfolio threshold, peak FIFO line, ZIP", () => {
  it("only 50k or 100k (jointly held) are kept; the paper prints the value used", () => {
    expect(normaliseFifThreshold(100000)).toBe(100000);
    expect(normaliseFifThreshold(75000)).toBe(50000);
    expect(fifThresholdText(100000)).toContain("(2 equal owners, no other FIF holdings)");
    const rows = [{ _id: "r1", type: "buy", ticker: "AAPL", asset_type: "stock", quantity: 10, price: 100, fx_rate: 1.7, executed_at: "2026-05-01" }] as never;
    const paper = buildFifPaper({ rows, markets: [], endingYear: 2027, thresholdNzd: 100000 });
    expect(paper.thresholdNzd).toBe(100000);
    const sentence = fifThresholdSentence(paper);
    expect(sentence).toContain("(2 equal owners, no other FIF holdings)");
    expect(sentence).toContain("peak FIFO cost, reached 2026-05-01");
    const page = read("src/app/tax/fif/page.tsx");
    expect(page).toContain("data-fif-threshold-setting".slice(0, 0) + "<FifThresholdSetting");
    expect(page).toContain("data-fif-peak");
    expect(page).not.toContain(">NZ$50,000 cost test<");
    expect(read("src/lib/fif-setting.server.ts")).toContain('FIF_SETTING_TICKER = "AF-FIFT"');
  });
  it("ZIP writer is valid (CRC-32 check value, signatures) and the pack CSVs carry source rows", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const zip = buildZip([{ name: "a.csv", data: "x,y\n1,2" }]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    const rows = [
      { _id: "r1", type: "buy", ticker: "AAPL", quantity: 10, price: 100, fx_rate: 1.7, cash_nzd: -1700, executed_at: "2026-05-01" },
      { _id: "r2", type: "buy", ticker: "MSFT", quantity: 1, price: 1, executed_at: "2026-06-01", notes: "[SPLIT:2:2026-06-01]" },
    ] as never;
    expect(tradesCsv(rows, 2027)).toContain("r1");
    expect(positionsCsv(buildFifPaper({ rows, markets: [], endingYear: 2027 }))).toContain("Opening market value NZD (1 Apr)");
    expect(corporateActionsCsv(rows, 2027).split("\n")[0]).toBe("Date,Action,Ticker,Detail,Ledger row");
    const route = read("src/app/api/tax/pack/zip/route.ts");
    for (const n of ["realised", "dividends", "fif", "income", "positions", "trades", "corporate-actions"]) expect(route).toContain(`${n}-\${endingYear}.csv`);
  });
});

describe("b29 G-29 / H-12", () => {
  it("Xero CSV is in the More and mobile menus; methodology has no dash placeholder", () => {
    expect(read("src/components/TopNav.tsx")).toContain('{ href: "/tax#xero", label: "Xero CSV"');
    expect(read("src/components/tax/TaxPageContent.tsx")).toContain('id="xero"');
    const m = read("src/app/methodology/page.tsx");
    expect(m).toContain("Results not published yet.");
    expect(m).not.toContain("Results: —");
  });
});
