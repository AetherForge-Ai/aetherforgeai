import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { signalRowFromPick } from "@/lib/chat-signals";
import { dailyPriceDirectory } from "@/lib/daily-price-directory";
import {
  appendDailyClose,
  buildSessionBoard,
  captureDailyCloses,
  comparisonCsv,
  exactBars,
  joinClosesAndPredictions,
  memoryDailyPriceStore,
  predictionsFromReports,
  absorbHistoryPage,
  createHistoryReadState,
  HISTORY_PAGE_SIZE,
  idemKey,
  type DailyCloseRow,
  type DailyPriceFeed,
} from "@/lib/daily-price-history";
import {
  CAPTURE_SLOTS,
  DAILY_PRICE_CRON_NZDT,
  DAILY_PRICE_CRON_NZST,
  DAILY_PRICE_CRON_UTC18,
  isAucklandCaptureWindow,
  lastCompletedSessionDate,
  latestAucklandCapture,
  utcForAuckland,
} from "@/lib/daily-price-schedule";
import { DEFAULT_CAPTURE_BUDGET, DEFAULT_DAILY_CREDIT_CEILING } from "@/lib/daily-price-capture";
import { DAILY_PRICE_FEEDS, DATA_LICENCE_REVIEW, historyStoreAllowed } from "@/lib/daily-price-sources";
import { barsFromTwelveValues, canReadTwelveData, loadTwelveDailyBars, loadTwelveDailyBatch, parseTwelveBatch, redactSecret } from "@/lib/daily-price-twelve";
import { DAILY_PRICE_CLOSE } from "@/lib/schema/daily-price-history.schema";
import { DOW_JONES_TICKERS, entriesForExchange } from "@/lib/market-intel";
// @ts-expect-error plain script
import { latestAucklandCapture as watchdogCapture } from "../../../scripts/cron-watchdog.mjs";

const read = (path: string) => readFileSync(path, "utf8");

const FIXTURE: DailyPriceFeed = {
  id: "fixture",
  licence: "allowed",
  markets: ["NZX"],
  usedBy: "test",
  note: "In-memory bars for the capture tests.",
};

function row(over: Partial<DailyCloseRow> = {}): DailyCloseRow {
  return {
    date: "2026-07-14",
    market: "NZX",
    symbol: "FPH.NZ",
    close: 36.8,
    change: 0.4,
    source: "fixture",
    captured_at: "2026-07-14T18:07:00.000Z",
    ...over,
  };
}

describe("DAILY-PRICES-1 append-only history", () => {
  it("a second capture for the same date and symbol does not add a row", async () => {
    const store = memoryDailyPriceStore();
    const feeds = [FIXTURE];
    expect(await appendDailyClose(store, row(), feeds)).toBe("inserted");
    expect(await appendDailyClose(store, row({ captured_at: "2026-07-15T18:07:00.000Z" }), feeds)).toBe("exists");
    expect(await store.list()).toHaveLength(1);
  });

  it("a rerun with a different close leaves the stored close in place", async () => {
    const store = memoryDailyPriceStore();
    const feeds = [FIXTURE];
    await appendDailyClose(store, row({ close: 36.8 }), feeds);
    expect(await appendDailyClose(store, row({ close: 99 }), feeds)).toBe("exists");
    expect((await store.list())[0].close).toBe(36.8);
    const server = read("src/lib/daily-price-history.server.ts");
    expect(server).not.toMatch(/updateRecord|deleteRecord/);
  });

  it("rejects a directory seed and an unconfirmed feed", async () => {
    const store = memoryDailyPriceStore();
    expect(historyStoreAllowed("yahoo-finance")).toBe(false);
    expect(historyStoreAllowed("twelve-data")).toBe(true);
    expect(await appendDailyClose(store, row({ source: "yahoo-finance" }), DAILY_PRICE_FEEDS)).toBe("rejected");
    expect(await appendDailyClose(store, row({ source: "universe-seed", close: 36.8 }), [FIXTURE])).toBe("rejected");
    expect(await store.list()).toEqual([]);
  });
});

describe("DAILY-PRICES-1 schedule is 06:07 through 07:07 Pacific/Auckland", () => {
  it("covers both DST offsets every 5 minutes, including the 2026 changeover days", () => {
    expect(CAPTURE_SLOTS).toHaveLength(13);
    expect(CAPTURE_SLOTS[0]).toEqual({ hour: 6, minute: 7 });
    expect(CAPTURE_SLOTS[CAPTURE_SLOTS.length - 1]).toEqual({ hour: 7, minute: 7 });
    expect(DAILY_PRICE_CRON_NZDT).toBe("7,12,17,22,27,32,37,42,47,52,57 17 * * *");
    expect(DAILY_PRICE_CRON_UTC18).toBe("2,7,12,17,22,27,32,37,42,47,52,57 18 * * *");
    expect(DAILY_PRICE_CRON_NZST).toBe("2,7 19 * * *");
    expect(utcForAuckland(2026, 1, 15, 6, 7)?.toISOString()).toBe("2026-01-14T17:07:00.000Z");
    expect(utcForAuckland(2026, 1, 15, 7, 7)?.toISOString()).toBe("2026-01-14T18:07:00.000Z");
    expect(utcForAuckland(2026, 7, 15, 6, 7)?.toISOString()).toBe("2026-07-14T18:07:00.000Z");
    expect(utcForAuckland(2026, 7, 15, 7, 7)?.toISOString()).toBe("2026-07-14T19:07:00.000Z");
    expect(utcForAuckland(2026, 4, 5, 6, 7)?.toISOString()).toBe("2026-04-04T18:07:00.000Z");
    expect(utcForAuckland(2026, 9, 27, 6, 7)?.toISOString()).toBe("2026-09-26T17:07:00.000Z");
    const summer = utcForAuckland(2026, 1, 15, 6, 7)!;
    const winter = utcForAuckland(2026, 7, 15, 6, 7)!;
    expect(isAucklandCaptureWindow(summer)).toBe(true);
    expect(isAucklandCaptureWindow(winter)).toBe(true);
    expect(isAucklandCaptureWindow(utcForAuckland(2026, 1, 15, 7, 7)!)).toBe(true);
    expect(isAucklandCaptureWindow(new Date(summer.getTime() - 60 * 60 * 1000))).toBe(false);
    expect(isAucklandCaptureWindow(utcForAuckland(2026, 1, 15, 7, 8)!)).toBe(false);
    expect(latestAucklandCapture(new Date("2026-01-15T06:30:00+13:00"))?.toISOString()).toBe("2026-01-14T17:27:00.000Z");
    expect(latestAucklandCapture(new Date("2026-07-15T06:30:00+12:00"))?.toISOString()).toBe("2026-07-14T18:27:00.000Z");
  });

  it("the workflow schedules the morning slots and queues overlapping runs", () => {
    const yml = read(".github/workflows/cron.yml");
    expect(yml).toContain(`- cron: "${DAILY_PRICE_CRON_NZDT}"`);
    expect(yml).toContain(`- cron: "${DAILY_PRICE_CRON_UTC18}"`);
    expect(yml).toContain(`- cron: "${DAILY_PRICE_CRON_NZST}"`);
    expect(yml).toContain("group: daily-prices");
    expect(yml).toContain("cancel-in-progress: false");
    expect(yml).toContain("/api/cron/daily-prices");
    expect(yml).toContain('x-cron-secret: ${CRON_SECRET}');
    expect(yml).not.toMatch(/\?key=/);
    expect(read("wrangler.jsonc")).not.toContain("crons");
    expect(read("src/app/api/cron/daily-prices/route.ts")).toContain("presentedHeaderCronSecret");
    expect(read("src/app/api/cron/daily-prices/route.ts")).toContain("fetchTwelveDailyBatch");
    expect(read("src/app/api/cron/daily-prices/route.ts")).not.toMatch(/acquireDailyPriceRunLock|daily_price_capture_lock/);
    expect(read("src/app/api/cron/daily-prices/route.ts")).not.toMatch(/finance\.yahoo/);
    expect(read("src/lib/daily-price-twelve.ts")).not.toMatch(/finance\.yahoo/);
  });

  it("the watchdog slot matches the Auckland capture instant", () => {
    for (const iso of ["2026-01-15T06:30:00+13:00", "2026-07-15T06:30:00+12:00", "2026-04-05T08:00:00+12:00", "2026-09-27T08:00:00+13:00"]) {
      const now = new Date(iso);
      expect(watchdogCapture(now.getTime())).toBe(latestAucklandCapture(now)?.getTime());
    }
  });

  it("6am Auckland stores the session that has already closed", () => {
    const winter = utcForAuckland(2026, 7, 15, 6, 7)!;
    expect(lastCompletedSessionDate("NZX", winter)).toBe("2026-07-14");
    expect(lastCompletedSessionDate("ASX", winter)).toBe("2026-07-14");
    expect(lastCompletedSessionDate("DOW", winter)).toBe("2026-07-13");
    expect(lastCompletedSessionDate("NASDAQ", winter)).toBe("2026-07-13");
    const summer = utcForAuckland(2026, 1, 15, 6, 7)!;
    expect(lastCompletedSessionDate("NZX", summer)).toBe("2026-01-14");
    expect(lastCompletedSessionDate("DOW", summer)).toBe("2026-01-13");
  });
});

describe("DAILY-PRICES-1 comparison and gaps", () => {
  it("lines a stored close up with the report pick and leaves a missing close empty", () => {
    const call = { horizon: "7-day", range: "", oddsPct: 60, killPrice: 1, realizedVolPct: 10, bear: [1, 2] as [number, number], base: [38, 40] as [number, number], bull: [3, 4] as [number, number] };
    const asOf = "2026-01-14T01:00:00.000Z";
    const signal = signalRowFromPick({ ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36.8, signal: "Strong Buy", sentiment: 80, call }, asOf, "stock");
    expect(signal?.predictedPrice).toBe(39);
    const predictions = predictionsFromReports([{ bot: "stock", generatedAt: asOf, payload: { tickers: [{ ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36.8, signal: "Strong Buy", sentiment: 80, call }] } }]);
    expect(predictions).toHaveLength(1);
    expect(predictions[0]).toMatchObject({ symbol: "FPH.NZ", label: "Strong Buy", predictedPrice: 39, date: "2026-01-14", origin: "report" });
    const lines = joinClosesAndPredictions(
      [{ date: "2026-01-14", market: "NZX", symbol: "FPH.NZ", close: 36.8, change: 0.2, source: "fixture", captured_at: "2026-01-14T17:07:00.000Z" }],
      [
        predictions[0],
        { date: "2026-01-14", market: "NZX", symbol: "AIR.NZ", label: "Sell", predictedPrice: 0.9, origin: "report", asOf },
      ]
    );
    const fph = lines.find((line) => line.symbol === "FPH.NZ");
    const air = lines.find((line) => line.symbol === "AIR.NZ");
    expect(fph).toMatchObject({ close: 36.8, predictedPrice: 39, label: "Strong Buy" });
    expect(air?.close).toBeNull();
    expect(air?.predictedPrice).toBe(0.9);
    expect(comparisonCsv(lines)).toContain("FPH.NZ");
    const csv = comparisonCsv([air!]);
    expect(csv.split("\n")[1].split(",")[3]).toBe("");
    expect(csv.split("\n")[1].split(",")[4]).toBe("");
  });

  it("a missing feed does not copy an earlier close or invent a bar", async () => {
    expect(exactBars([{ date: "2026-07-13", close: 100 }], ["2026-07-14"])).toEqual([]);
    expect(exactBars([{ date: "2026-07-14", close: null }, { date: "2026-07-13", close: 99 }], ["2026-07-14"])).toEqual([]);
    const now = utcForAuckland(2026, 7, 15, 6, 7)!;
    const store = memoryDailyPriceStore();
    const report = await captureDailyCloses({
      now,
      store,
      feeds: [FIXTURE],
      names: [
        { market: "NZX", symbol: "^NZ50", name: "S&P/NZX 50", role: "index" },
        { market: "NZX", symbol: "FPH.NZ", name: "Fisher & Paykel Healthcare", role: "constituent" },
      ],
      readFeed: async (_feed, _market, symbol) => (symbol === "^NZ50" ? null : [{ date: "2026-07-13", close: 36.8 }]),
    });
    expect(report.inserted).toBe(0);
    expect(report.gaps).toBeGreaterThan(0);
    expect(await store.list()).toEqual([]);
    const board = buildSessionBoard({
      now,
      rows: [],
      names: [{ market: "NZX", symbol: "FPH.NZ", name: "Fisher & Paykel Healthcare", role: "constituent" }],
    });
    expect(board[0].close).toBeNull();
    expect(board[0].date).toBe("2026-07-14");
    const mixed = buildSessionBoard({
      now,
      rows: [
        { date: "2026-07-14", market: "NZX", symbol: "^NZ50", close: 12000, change: 1, source: "fixture", captured_at: "2026-07-14T18:07:00.000Z" },
        { date: "2026-07-13", market: "NZX", symbol: "FPH.NZ", close: 36, change: 1, source: "fixture", captured_at: "2026-07-13T18:07:00.000Z" },
      ],
      names: [
        { market: "NZX", symbol: "^NZ50", name: "S&P/NZX 50", role: "index" },
        { market: "NZX", symbol: "FPH.NZ", name: "Fisher & Paykel Healthcare", role: "constituent" },
      ],
    });
    expect(mixed[0].close).toBe(12000);
    expect(mixed[1]).toMatchObject({ date: "2026-07-14", close: null, change: null });
  });

  it("stores Twelve Data bars and refuses Yahoo", async () => {
    expect(DAILY_PRICE_FEEDS.find((feed) => feed.id === "twelve-data")?.note).toBe("approved by Lukas 15 Nov 2026");
    expect(DAILY_PRICE_FEEDS.find((feed) => feed.id === "yahoo-finance")?.licence).toBe("unconfirmed");
    const store = memoryDailyPriceStore();
    const called: string[] = [];
    const now = utcForAuckland(2026, 1, 15, 6, 7)!;
    const report = await captureDailyCloses({
      now,
      store,
      feeds: DAILY_PRICE_FEEDS,
      names: [{ market: "NZX", symbol: "FPH.NZ", name: "Fisher & Paykel Healthcare", role: "constituent" }],
      readFeed: async (feed) => {
        called.push(feed.id);
        return [{ date: "2026-01-14", close: 36.8, change: 0.4 }];
      },
    });
    expect(called).toEqual(["twelve-data"]);
    expect(report.skipped.map((skip) => skip.source)).toContain("yahoo-finance");
    expect(report.skipped.find((skip) => skip.source === "yahoo-finance")?.reason).toBe(DATA_LICENCE_REVIEW);
    expect(report.inserted).toBe(1);
    expect((await store.list())[0]).toMatchObject({ source: "twelve-data", close: 36.8, symbol: "FPH.NZ" });
    expect(await appendDailyClose(store, row({ source: "yahoo-finance", date: "2026-01-13" }), DAILY_PRICE_FEEDS)).toBe("rejected");
    expect(await store.list()).toHaveLength(1);
  });

  it("a missing Twelve Data key stores nothing and does not call the feed", async () => {
    expect(canReadTwelveData({})).toBe(false);
    expect(canReadTwelveData({ MARKET_DATA_API_KEY: "   " })).toBe(false);
    const fetchImpl = async () => ({ values: [{ datetime: "2026-01-14", close: "36.8" }] });
    const barred = await loadTwelveDailyBars({
      symbol: "FPH.NZ",
      market: "NZX",
      dates: ["2026-01-14"],
      env: {},
      fetchImpl,
    });
    expect(barred).toBeNull();
    const store = memoryDailyPriceStore();
    const report = await captureDailyCloses({
      now: utcForAuckland(2026, 1, 15, 6, 7)!,
      store,
      feeds: DAILY_PRICE_FEEDS,
      names: [{ market: "NZX", symbol: "FPH.NZ", name: "Fisher & Paykel Healthcare", role: "constituent" }],
      readFeed: async (feed, market, symbol, dates) => {
        if (feed.id !== "twelve-data") return null;
        return loadTwelveDailyBars({ symbol, market, dates, env: {}, fetchImpl });
      },
    });
    expect(report.inserted).toBe(0);
    expect(await store.list()).toEqual([]);
    expect(read("src/app/markets/daily-prices/page.tsx")).toContain("canReadTwelveData");
    expect(read("src/app/api/cron/daily-prices/route.ts")).toContain("canReadTwelveData");
  });

  it("parses Twelve Data daily bars without copying a missing day or keeping the key", async () => {
    const key = "secret-key-value";
    expect(redactSecret(`upstream said ${key}`, key)).not.toContain(key);
    let seen = "";
    const bars = await loadTwelveDailyBars({
      symbol: "FPH.NZ",
      market: "NZX",
      dates: ["2026-01-13", "2026-01-14", "2026-01-15"],
      env: { MARKET_DATA_API_KEY: key },
      fetchImpl: async (req) => {
        seen = req.apiKey;
        expect(req.url).toContain("https://api.twelvedata.com/time_series?");
        expect(req.url).toContain("interval=1day");
        expect(req.symbol).toBe("FPH");
        expect(req.country).toBe("New Zealand");
        return {
          values: [
            { datetime: "2026-01-13", close: "36.4" },
            { datetime: "2026-01-14", close: "36.8" },
            { datetime: "2026-01-15", close: "" },
          ],
        };
      },
    });
    expect(seen).toBe(key);
    expect(JSON.stringify(bars)).not.toContain(key);
    expect(bars).toEqual([
      { date: "2026-01-13", close: 36.4, change: null },
      { date: "2026-01-14", close: 36.8, change: 0.4 },
    ]);
    expect(barsFromTwelveValues([{ datetime: "2026-01-13", close: "1" }], ["2026-01-14"])).toEqual([]);
    const index = await loadTwelveDailyBars({
      symbol: "^NZ50",
      market: "NZX",
      dates: ["2026-01-14"],
      env: { MARKET_DATA_API_KEY: key },
      fetchImpl: async (req) => {
        expect(req.symbol).toBe("NZ50");
        expect(req.country).toBe("New Zealand");
        return { values: [{ datetime: "2026-01-14", close: "12000" }] };
      },
    });
    expect(index).toEqual([{ date: "2026-01-14", close: 12000, change: null }]);
  });

  it("uses the constituent lists already in the repo and not their seed prices", () => {
    const directory = dailyPriceDirectory();
    expect(directory.find((row) => row.market === "NZX" && row.role === "index")?.symbol).toBe("^NZ50");
    expect(directory.find((row) => row.market === "ASX" && row.role === "index")?.symbol).toBe("^AXJO");
    expect(directory.find((row) => row.market === "DOW" && row.role === "index")?.symbol).toBe("^DJI");
    expect(directory.find((row) => row.market === "NASDAQ" && row.role === "index")?.symbol).toBe("^IXIC");
    for (const market of ["NZX", "ASX", "DOW", "NASDAQ"] as const) {
      const listed = directory.filter((row) => row.market === market && row.role === "constituent").map((row) => row.symbol);
      expect(listed).toEqual(entriesForExchange(market).map((entry) => entry.ticker.toUpperCase()));
      expect(listed.length).toBeGreaterThan(0);
    }
    for (const symbol of directory.filter((row) => row.market === "DOW" && row.role === "constituent").map((row) => row.symbol)) {
      expect(DOW_JONES_TICKERS.has(symbol)).toBe(true);
    }
    expect(read("src/lib/daily-price-directory.ts")).not.toContain("basePrice");
    expect(read("src/lib/daily-price-history.ts")).not.toContain("basePrice");
    expect(read("src/lib/daily-price-history.ts")).not.toContain("closeOnOrBefore");
    expect(read("src/app/markets/daily-prices/page.tsx")).toContain("HISTORY_UNAVAILABLE");
    expect(read("src/lib/daily-price-history.ts")).toContain('export const HISTORY_UNAVAILABLE = "history unavailable"');
    expect(read("src/components/dashboard/MarketsPageContent.tsx")).toContain('href="/markets/daily-prices"');
  });

  it("the table definition is the one Lukas has to create; the flag defaults off", () => {
    expect(DAILY_PRICE_CLOSE.table).toBe("daily_price_close");
    expect(DAILY_PRICE_CLOSE.fields.map((field) => field.name)).toEqual([
      "date",
      "market",
      "symbol",
      "close",
      "change",
      "source",
      "captured_at",
      "idem_key",
    ]);
    expect(DAILY_PRICE_CLOSE.flag).toBe("DAILY_PRICE_HISTORY_TABLE=on");
    expect(DAILY_PRICE_CLOSE.indexes[0]).toEqual({ fields: ["idem_key"], unique: true });
    expect(read("src/lib/schema/daily-price-history.schema.ts")).not.toContain("DAILY_PRICE_CAPTURE_LOCK");
    expect(read("src/lib/daily-price-history.server.ts")).toContain("dailyPriceHistoryEnabled");
    expect(read("src/lib/daily-price-history.server.ts")).not.toMatch(/migrate|CREATE TABLE|editRecordById|updateRecord|deleteRecord/i);
  });

  it("paces Twelve Data, fetches indexes first, and skips a symbol that is already stored", async () => {
    const now = utcForAuckland(2026, 1, 15, 6, 7)!;
    const names = [
      { market: "NZX" as const, symbol: "FPH.NZ", name: "Fisher & Paykel Healthcare", role: "constituent" as const },
      { market: "NZX" as const, symbol: "AIR.NZ", name: "Air New Zealand", role: "constituent" as const },
      { market: "NZX" as const, symbol: "^NZ50", name: "S&P/NZX 50", role: "index" as const },
    ];
    let clock = 0;
    const sleeps: number[] = [];
    const called: string[] = [];
    const paced = await captureDailyCloses({
      now,
      store: memoryDailyPriceStore(),
      feeds: DAILY_PRICE_FEEDS,
      names,
      sessions: 1,
      budget: { creditsPerMinute: 1, maxCreditsPerRun: 2, batchSize: 1, budgetMs: 240_000, dailyCreditCeiling: 500 },
      nowMs: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      readFeed: async (_feed, _market, symbol) => {
        called.push(symbol);
        return [{ date: "2026-01-14", close: 10, change: null }];
      },
    });
    expect(called).toEqual(["^NZ50", "AIR.NZ"]);
    expect(paced.deferred).toBe(1);
    expect(paced.credits).toBe(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(60_000);
    expect(paced.inserted).toBe(2);

    let fetched = 0;
    const skipped = await captureDailyCloses({
      now,
      store: memoryDailyPriceStore(),
      feeds: DAILY_PRICE_FEEDS,
      names: [names[2]],
      sessions: 1,
      storedKeys: new Set([idemKey("2026-01-14", "NZX", "^NZ50")]),
      readFeed: async () => {
        fetched += 1;
        return [{ date: "2026-01-14", close: 10, change: null }];
      },
    });
    expect(fetched).toBe(0);
    expect(skipped.inserted).toBe(0);
    expect(skipped.credits).toBe(0);

    const batch = await loadTwelveDailyBatch({
      names: [
        { symbol: "FPH.NZ", market: "NZX" },
        { symbol: "AIR.NZ", market: "NZX" },
      ],
      dates: ["2026-01-14"],
      env: { MARKET_DATA_API_KEY: "batch-key" },
      fetchImpl: async (req) => {
        expect(req.symbols).toEqual(["FPH", "AIR"]);
        expect(req.url).not.toContain("finance.yahoo");
        expect(JSON.stringify(req.symbols)).not.toContain("batch-key");
        return {
          FPH: { values: [{ datetime: "2026-01-14", close: "36.8" }] },
          AIR: { status: "error", code: 404 },
        };
      },
    });
    expect(batch.get("FPH.NZ")).toEqual([{ date: "2026-01-14", close: 36.8, change: null }]);
    expect(batch.get("AIR.NZ")).toBeNull();
    expect(parseTwelveBatch({ values: [{ datetime: "2026-01-14", close: "1" }] }, [{ internal: "FPH.NZ", provider: "FPH" }], ["2026-01-14"]).get("FPH.NZ")?.[0].close).toBe(1);
  });

  it("reads the newest session when the table has more than 5000 rows", () => {
    const symbols = Array.from({ length: 401 }, (_, index) => `S${index}`);
    const dates = Array.from({ length: 20 }, (_, index) => `2026-06-${String(index + 1).padStart(2, "0")}`);
    const oldestFirst: DailyCloseRow[] = [];
    for (const date of dates) {
      for (const symbol of symbols) {
        oldestFirst.push({
          date,
          market: "NZX",
          symbol,
          close: 1,
          change: null,
          source: "twelve-data",
          captured_at: `${date}T00:00:00.000Z`,
        });
      }
    }
    expect(oldestFirst.length).toBe(8020);
    expect(oldestFirst.slice(0, 5000).some((row) => row.date === dates[19])).toBe(false);
    const newestFirst = [...oldestFirst].reverse();
    const state = createHistoryReadState();
    for (let offset = 0; offset < newestFirst.length; offset += HISTORY_PAGE_SIZE) {
      const page = newestFirst.slice(offset, offset + HISTORY_PAGE_SIZE);
      const step = absorbHistoryPage(state, page, page.length, HISTORY_PAGE_SIZE);
      if (!step.continue) break;
    }
    const newest = state.kept.filter((row) => row.date === dates[19]);
    expect(newest).toHaveLength(401);
    expect(new Set(newest.map((row) => row.symbol)).size).toBe(401);
    expect(state.kept.every((row) => row.date === dates[19])).toBe(true);

    const split = createHistoryReadState();
    const session = ["A", "B", "C"].map((symbol) => ({
      date: "2026-07-14",
      market: "NZX" as const,
      symbol,
      close: 1,
      change: null,
      source: "twelve-data",
      captured_at: "2026-07-14T18:00:00.000Z",
    }));
    const older = { ...session[0], date: "2026-07-13", symbol: "A" };
    expect(absorbHistoryPage(split, session.slice(0, 2), 2, 2).continue).toBe(true);
    absorbHistoryPage(split, [session[2], older], 2, 2);
    expect(split.kept.map((row) => row.symbol)).toEqual(["A", "B", "C"]);
  });

  it("a second look before insert does not write", async () => {
    let finds = 0;
    const stored = row({ date: "2026-07-15" });
    const store = {
      async find() {
        finds += 1;
        return finds === 1 ? null : stored;
      },
      async insert() {
        throw new Error("inserted");
      },
      async list() {
        return [];
      },
    };
    expect(await appendDailyClose(store, stored, [FIXTURE])).toBe("exists");
    expect(finds).toBe(2);
  });

  it("one morning of 5-minute runs stores the full universe under the daily credit ceiling", async () => {
    expect(DEFAULT_DAILY_CREDIT_CEILING).toBe(500);
    expect(DEFAULT_CAPTURE_BUDGET.maxCreditsPerRun).toBe(32);
    expect(DEFAULT_CAPTURE_BUDGET.creditsPerMinute).toBe(8);
    expect(DEFAULT_CAPTURE_BUDGET.budgetMs).toBe(240_000);
    const names = dailyPriceDirectory();
    expect(names.length).toBeGreaterThan(24);
    const morning = CAPTURE_SLOTS.map((slot) => utcForAuckland(2026, 1, 15, slot.hour, slot.minute)!);
    expect(morning).toHaveLength(13);
    expect(isAucklandCaptureWindow(morning[0])).toBe(true);
    expect(isAucklandCaptureWindow(morning[morning.length - 1])).toBe(true);
    const store = memoryDailyPriceStore();
    const budget = { ...DEFAULT_CAPTURE_BUDGET };
    let clock = morning[0].getTime();
    let creditsToday = 0;
    const calls: string[] = [];
    for (const slot of morning) {
      if (slot.getTime() > clock) clock = slot.getTime();
      const started = clock;
      const storedKeys = new Set((await store.list()).map((entry) => idemKey(entry.date, entry.market, entry.symbol)));
      const report = await captureDailyCloses({
        now: new Date(clock),
        store,
        feeds: DAILY_PRICE_FEEDS,
        names,
        sessions: 1,
        storedKeys,
        creditsAlreadyUsed: creditsToday,
        budget,
        nowMs: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        readFeed: async (_feed, _market, symbol, dates) => {
          calls.push(symbol);
          return dates.map((date) => ({ date, close: 10, change: null }));
        },
      });
      expect(clock - started).toBeLessThanOrEqual(budget.budgetMs);
      expect(report.credits).toBeLessThanOrEqual(budget.maxCreditsPerRun);
      creditsToday += report.credits;
      expect(creditsToday).toBeLessThanOrEqual(budget.dailyCreditCeiling);
    }
    expect(new Set(calls).size).toBe(names.length);
    expect(creditsToday).toBe(names.length);
    expect(await store.list()).toHaveLength(names.length);
    const done = new Set((await store.list()).map((entry) => idemKey(entry.date, entry.market, entry.symbol)));
    let after = 0;
    const quiet = await captureDailyCloses({
      now: morning[morning.length - 1],
      store,
      feeds: DAILY_PRICE_FEEDS,
      names,
      sessions: 1,
      storedKeys: done,
      creditsAlreadyUsed: creditsToday,
      budget,
      readFeed: async () => {
        after += 1;
        return [];
      },
    });
    expect(after).toBe(0);
    expect(quiet.credits).toBe(0);
    expect(quiet.reason).toBe("complete");

    let blocked = 0;
    const capped = await captureDailyCloses({
      now: morning[0],
      store: memoryDailyPriceStore(),
      feeds: DAILY_PRICE_FEEDS,
      names: names.slice(0, 3),
      sessions: 1,
      creditsAlreadyUsed: 500,
      budget,
      readFeed: async () => {
        blocked += 1;
        return [{ date: "2026-01-14", close: 1, change: null }];
      },
    });
    expect(blocked).toBe(0);
    expect(capped.credits).toBe(0);
    expect(capped.deferred).toBe(3);
  });
});
