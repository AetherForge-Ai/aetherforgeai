import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendRecord,
  parseForecastLog,
  serialiseForecastLog,
  verifyChain,
  type ForecastBody,
} from "@/lib/forecast-chain";
import { forecastLayerEnabled, forecastLogEnabled } from "@/lib/forecast-flags";
import {
  CRYPTO_PROJECTIONS_PAUSED,
} from "@/lib/projection-pause";
import {
  forecastViewForEvidence,
  type ForecastEvidence,
} from "@/lib/forecast-present";
import { brierScore, scorecardFromLog, wilsonInterval } from "@/lib/forecast-scorecard";
import { commitForecasts, readForecastLog } from "@/lib/forecast-store";
import { documentAccess } from "@/lib/route-gate";

const BANNED = /guaranteed|certain|will rise|will fall|can't lose|real-time|realtime|official NZX|licensed|GST|SuperGrok|\bGrok\b/i;

function evidence(partial: Partial<ForecastEvidence> = {}): ForecastEvidence {
  return {
    bot: "stox",
    ticker: "FPH.NZ",
    market: "NZX",
    assetClass: "stock",
    surface: "report",
    venueDex: false,
    inNamedUniverse: true,
    price: 36.5,
    observedHistory: true,
    baseLowPct: 1.2,
    baseHighPct: 2.4,
    confidence: 72,
    regime: "Range-Bound",
    rsi: 55,
    macdSignal: "Bullish",
    vsSma20: 1.4,
    priorDayUp: true,
    ...partial,
  };
}

function forecast(partial: Partial<ForecastBody> = {}): ForecastBody {
  return {
    kind: "forecast",
    id: partial.id || "stox:FPH.NZ:7d:2026-10-01",
    ts_utc: partial.ts_utc || "2026-10-01T00:00:00.000Z",
    bot: "stox",
    ticker: "FPH.NZ",
    horizon: "7d",
    stance: "directional",
    direction: "up",
    p_up: null,
    fit_band: "70-84",
    inputs_summary: "observed-closes",
    drivers: ["MACD is bullish"],
    source_label: "Source: public market data (Yahoo Finance), delayed. Not a direct NZX or ASX feed.",
    delay_label: "Delayed. The as-of time is the time the feed last answered.",
    price_at_issue: 36,
    naive_up: true,
    model_version: "rules-range-7d-v1",
    features_hash: "abc",
    ...partial,
  };
}

describe("forecast hash chain", () => {
  it("starts empty, verifies, and fails when a line is edited", () => {
    expect(verifyChain([]).ok).toBe(true);
    const first = appendRecord([], forecast());
    const second = appendRecord([first], forecast({ id: "stox:MEL.NZ:7d:2026-10-01", ticker: "MEL.NZ" }));
    expect(verifyChain([first, second]).ok).toBe(true);
    const tampered = { ...first, price_at_issue: 99 };
    expect(verifyChain([tampered, second]).ok).toBe(false);
    const text = serialiseForecastLog([first, second]);
    const parsed = parseForecastLog(text);
    expect(parsed.error).toBeNull();
    expect(verifyChain(parsed.records).ok).toBe(true);
  });

  it("appends an outcome without rewriting the forecast", () => {
    const issued = appendRecord([], forecast());
    const outcome = appendRecord([issued], {
      kind: "outcome",
      id: `outcome:${issued.id}`,
      forecast_id: issued.id,
      ts_utc: "2026-10-08T00:00:00.000Z",
      actual_return_pct: -1.5,
      actual_up: false,
      price_at_outcome: 35.4,
      source_label: issued.source_label,
    });
    expect(outcome.forecast_id).toBe(issued.id);
    expect(verifyChain([issued, outcome]).ok).toBe(true);
    expect(issued.price_at_issue).toBe(36);
    expect(issued.hash).toBe(appendRecord([], forecast()).hash);
  });

  it("keeps the committed log empty", () => {
    const file = path.join(process.cwd(), "data", "forecast-log.jsonl");
    const parsed = readForecastLog(file);
    expect(parsed.error).toBeNull();
    expect(parsed.records).toEqual([]);
    expect(verifyChain(parsed.records).ok).toBe(true);
    const card = scorecardFromLog(parsed);
    expect(card.status).toBe("empty");
    expect(card.hitRate).toBeNull();
    expect(card.brier).toBeNull();
    expect(card.logged).toBe(0);
    expect(card.message).toMatch(/Not enough data yet/);
  });
});

describe("forecast scorecard", () => {
  it("computes a Wilson interval and a Brier score from supplied rows only", () => {
    const interval = wilsonInterval(7, 10);
    expect(interval).not.toBeNull();
    expect(interval!.low).toBeCloseTo(0.3968, 3);
    expect(interval!.high).toBeCloseTo(0.8922, 3);
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(
      brierScore([
        { p: 1, y: 1 },
        { p: 0, y: 0 },
        { p: 1, y: 0 },
      ]),
    ).toBeCloseTo(1 / 3, 6);
    expect(brierScore([])).toBeNull();
  });

  it("withholds a rate until enough directional forecasts have outcomes", () => {
    let records = [] as ReturnType<typeof appendRecord>[];
    for (let i = 0; i < 5; i++) {
      const body = forecast({ id: `stox:FPH.NZ:7d:2026-09-0${i + 1}`, ts_utc: `2026-09-0${i + 1}T00:00:00.000Z` });
      records = [...records, appendRecord(records, body)];
      records = [
        ...records,
        appendRecord(records, {
          kind: "outcome",
          id: `outcome:${body.id}`,
          forecast_id: body.id,
          ts_utc: `2026-09-0${i + 1}T12:00:00.000Z`,
          actual_return_pct: 1,
          actual_up: true,
          price_at_outcome: 37,
          source_label: body.source_label,
        }),
      ];
    }
    const card = scorecardFromLog({ records, error: null });
    expect(card.status).toBe("not-enough");
    expect(card.hitRate).toBeNull();
    expect(card.wilson).toBeNull();
    expect(card.brier).toBeNull();
    expect(card.directionalResolved).toBe(5);
    expect(card.message).toMatch(/Not enough data yet/);
  });

  it("scores hits, the naive prior day, and buy-and-hold on the same names", () => {
    let records = [] as ReturnType<typeof appendRecord>[];
    for (let i = 0; i < 30; i++) {
      const up = i % 2 === 0;
      const body = forecast({
        id: `stox:FPH.NZ:7d:n${i}`,
        ts_utc: `2026-08-${String((i % 27) + 1).padStart(2, "0")}T00:00:00.000Z`,
        direction: "up",
        p_up: 0.6,
        naive_up: up,
      });
      records = [...records, appendRecord(records, body)];
      records = [
        ...records,
        appendRecord(records, {
          kind: "outcome",
          id: `outcome:${body.id}`,
          forecast_id: body.id,
          ts_utc: "2026-09-15T00:00:00.000Z",
          actual_return_pct: up ? 1 : -1,
          actual_up: up,
          price_at_outcome: up ? 37 : 35,
          source_label: body.source_label,
        }),
      ];
    }
    const card = scorecardFromLog({ records, error: null });
    expect(card.status).toBe("scored");
    expect(card.hits).toBe(15);
    expect(card.hitRate).toBeCloseTo(0.5, 6);
    expect(card.wilson?.low).toBeLessThan(0.5);
    expect(card.wilson?.high).toBeGreaterThan(0.5);
    expect(card.brier).toBeGreaterThan(0);
    expect(card.naiveHitRate).toBe(1);
    expect(card.buyHoldHitRate).toBeCloseTo(0.5, 6);
    expect(card.edgeNote).toMatch(/too small/);
    expect(card.calibration).toEqual([{ band: "70-84", n: 30, realised: 0.5 }]);
  });

  it("shows no figures when the chain is broken", () => {
    const row = appendRecord([], forecast());
    const card = scorecardFromLog({ records: [{ ...row, drivers: ["edited"] }], error: null });
    expect(card.status).toBe("unverified");
    expect(card.hitRate).toBeNull();
    expect(card.logged).toBeNull();
  });
});

describe("forecast presentation", () => {
  it("states no edge when the range includes both directions", () => {
    const view = forecastViewForEvidence(evidence({ baseLowPct: -1.1, baseHighPct: 0.8 }));
    expect(view.stance).toBe("no-edge");
    expect(view.direction).toBeNull();
    expect(view.loggable).toBe(true);
    expect(view.headline).toMatch(/No edge/);
    expect(view.why).toMatch(/MACD is bullish/);
    expect(view.pUp).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(BANNED);
  });

  it("does not present a probability until that band has a realised frequency", () => {
    const plain = forecastViewForEvidence(evidence());
    expect(plain.stance).toBe("directional");
    expect(plain.direction).toBe("up");
    expect(plain.probabilityLabel).toMatch(/not shown/i);
    expect(plain.pUp).toBeNull();
    const counted = forecastViewForEvidence(evidence({ resolvedInBand: { hits: 11, n: 20 } }));
    expect(counted.pUp).toBeCloseTo(0.55, 6);
    expect(counted.probabilityLabel).toContain("20");
    expect(counted.probabilityLabel).toContain("11");
    expect(counted.sourceLabel).toMatch(/Yahoo Finance/);
    expect(counted.sourceLabel).toMatch(/Not a direct NZX or ASX feed/);
  });

  it("withholds DEX tokens, unnamed coins, and illiquid names", () => {
    expect(forecastViewForEvidence(evidence({ venueDex: true })).loggable).toBe(false);
    expect(forecastViewForEvidence(evidence({ venueDex: true })).headline).toMatch(/DEX/);
    expect(
      forecastViewForEvidence(
        evidence({
          bot: "koins",
          ticker: "0xabc123456789",
          market: "CRYPTO",
          assetClass: "crypto",
          inNamedUniverse: false,
        }),
      ).loggable,
    ).toBe(false);
    expect(
      forecastViewForEvidence(
        evidence({ ticker: "TINY.NZ", inNamedUniverse: false, valueTraded: 1_000 }),
      ).headline,
    ).toMatch(/floor/);
    expect(
      forecastViewForEvidence(evidence({ ticker: "OUT.NZ", inNamedUniverse: false })).headline,
    ).toMatch(/Liquidity is not in the data/);
  });

  it("keeps crypto projections paused", () => {
    expect(CRYPTO_PROJECTIONS_PAUSED).toBe(true);
    const view = forecastViewForEvidence(
      evidence({
        bot: "koins",
        ticker: "BTC",
        market: "CRYPTO",
        assetClass: "crypto",
        surface: "projections",
        inNamedUniverse: true,
      }),
    );
    expect(view.stance).toBe("withheld");
    expect(view.loggable).toBe(false);
    expect(view.headline).toMatch(/paused/i);
  });

  it("leaves the layer and the log off unless the owner turns them on", () => {
    delete process.env.FORECAST_LAYER;
    delete process.env.FORECAST_LOG;
    expect(forecastLayerEnabled()).toBe(false);
    expect(forecastLogEnabled()).toBe(false);
    process.env.FORECAST_LOG = "on";
    expect(forecastLogEnabled()).toBe(false);
    process.env.FORECAST_LAYER = "on";
    expect(forecastLayerEnabled()).toBe(true);
    expect(forecastLogEnabled()).toBe(true);
    delete process.env.FORECAST_LAYER;
    delete process.env.FORECAST_LOG;
  });
});

describe("forecast log store", () => {
  it("appends once and writes the later price as a new line", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "forecast-log-"));
    const file = path.join(dir, "forecast-log.jsonl");
    const issuedAt = Date.parse("2026-09-01T00:00:00.000Z");
    const body = forecast({ ts_utc: new Date(issuedAt).toISOString(), price_at_issue: 10 });
    const first = commitForecasts({ file, forecasts: [body], nowMs: issuedAt });
    expect(first).toEqual({ appended: 1, resolved: 0, ok: true });
    const again = commitForecasts({ file, forecasts: [body], nowMs: issuedAt });
    expect(again.appended).toBe(0);
    const later = commitForecasts({
      file,
      forecasts: [],
      nowMs: issuedAt + 8 * 24 * 60 * 60 * 1000,
      prices: { "FPH.NZ": 9 },
    });
    expect(later.resolved).toBe(1);
    const parsed = readForecastLog(file);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0].kind).toBe("forecast");
    expect(parsed.records[1].kind).toBe("outcome");
    if (parsed.records[1].kind === "outcome") {
      expect(parsed.records[1].actual_up).toBe(false);
      expect(parsed.records[1].forecast_id).toBe(body.id);
    }
    expect(verifyChain(parsed.records).ok).toBe(true);
    const raw = readFileSync(file, "utf8");
    expect(raw.match(/"kind":"forecast"/g)).toHaveLength(1);
  });

  it("does not append over a broken file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "forecast-log-"));
    const file = path.join(dir, "forecast-log.jsonl");
    writeFileSync(file, "{\"kind\":\"forecast\",\"hash\":\"nope\",\"prev_hash\":\"00\"}\n");
    const result = commitForecasts({ file, forecasts: [forecast()], nowMs: Date.now() });
    expect(result.ok).toBe(false);
    expect(result.appended).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("nope");
  });
});

describe("track record page", () => {
  it("is public, linked, and does not invent a rate", () => {
    expect(documentAccess("/track-record")).toBe("public");
    const page = readFileSync(path.join(process.cwd(), "src/app/track-record/page.tsx"), "utf8");
    expect(page).toContain("Not enough data yet");
    expect(page).toContain("Yahoo Finance");
    expect(page).toContain("Not a direct NZX or ASX feed");
    expect(page).not.toMatch(BANNED);
    expect(page).not.toMatch(/\b\d+(\.\d+)?%/);
    const sitemap = readFileSync(path.join(process.cwd(), "src/app/sitemap.ts"), "utf8");
    expect(sitemap).toContain('"/track-record"');
    expect(readFileSync(path.join(process.cwd(), "src/app/projections/page.tsx"), "utf8")).toContain("index: false");
    expect(readFileSync(path.join(process.cwd(), "src/lib/projection-pause.ts"), "utf8")).toContain(
      "export const CRYPTO_PROJECTIONS_PAUSED = true",
    );
  });
});
