import type { IntelligenceBriefing } from "@/lib/briefing";
import type { ProjectionRow, TickerAnalysis } from "@/lib/apex";
import { fetchHistoriesForAssetClass } from "@/lib/market-data";
import { universeFor, type SecurityIntel } from "@/lib/market-intel";
import { forecastLayerEnabled, forecastLogEnabled } from "@/lib/forecast-flags";
import { bandFrequency } from "@/lib/forecast-scorecard";
import {
  fitBand,
  forecastId,
  forecastViewForEvidence,
  isObservedHistory,
  MODEL_VERSION,
  utcDay,
  type ForecastSurface,
  type ForecastView,
} from "@/lib/forecast-present";
import type { ForecastBody } from "@/lib/forecast-chain";
import { commitForecasts, readForecastLog } from "@/lib/forecast-store";

export interface ForecastAttachInput {
  bot: "stox" | "koins";
  surface: ForecastSurface;
  assetClass: "stock" | "crypto";
  rows: SecurityIntel[];
  histories?: Record<string, number[]>;
  dexTickers?: ReadonlySet<string>;
  nowMs?: number;
}

function namedSet(assetClass: "stock" | "crypto"): Set<string> {
  return new Set(universeFor(assetClass).map((row) => row.ticker.toUpperCase()));
}

export function viewsForIntel(input: ForecastAttachInput, priorRecords = readForecastLog().records): Map<string, ForecastView> {
  const named = namedSet(input.assetClass);
  const dex = input.dexTickers || new Set<string>();
  const views = new Map<string, ForecastView>();
  for (const row of input.rows) {
    const ticker = row.ticker.toUpperCase();
    const history = input.histories?.[row.ticker] || input.histories?.[ticker];
    const resolved = bandFrequency(priorRecords, fitBand(row.confidence));
    const view = forecastViewForEvidence({
      bot: input.bot,
      ticker,
      market: row.market,
      assetClass: row.assetClass,
      surface: input.surface,
      venueDex: dex.has(ticker),
      inNamedUniverse: named.has(ticker),
      price: row.price,
      observedHistory: isObservedHistory(history),
      baseLowPct: row.outlook?.base?.lowPct ?? null,
      baseHighPct: row.outlook?.base?.highPct ?? null,
      confidence: row.confidence,
      regime: row.regime,
      rsi: row.rsi,
      macdSignal: row.macdSignal,
      vsSma20: row.vsSma20,
      priorDayUp: row.change1d > 0 ? true : row.change1d < 0 ? false : null,
      resolvedInBand: resolved,
    });
    views.set(ticker, view);
  }
  return views;
}

export function bodiesFromViews(bot: "stox" | "koins", views: Map<string, ForecastView>, nowMs: number): ForecastBody[] {
  const day = utcDay(nowMs);
  const bodies: ForecastBody[] = [];
  for (const view of views.values()) {
    if (!view.loggable || !(view.priceAtIssue && view.priceAtIssue > 0)) continue;
    bodies.push({
      kind: "forecast",
      id: forecastId(bot, view.ticker, day),
      ts_utc: new Date(nowMs).toISOString(),
      bot,
      ticker: view.ticker,
      horizon: "7d",
      stance: view.stance === "directional" ? "directional" : "no-edge",
      direction: view.direction,
      p_up: view.pUp,
      fit_band: view.fitBand,
      inputs_summary: view.inputsSummary,
      drivers: view.drivers,
      source_label: view.sourceLabel,
      delay_label: view.delayLabel,
      price_at_issue: view.priceAtIssue,
      naive_up: view.naiveUp,
      model_version: MODEL_VERSION,
      features_hash: view.featuresHash,
    });
  }
  return bodies;
}

export function softenBriefing(briefing: IntelligenceBriefing, views: Map<string, ForecastView>): IntelligenceBriefing {
  const notes = [...views.values()]
    .slice(0, 4)
    .map((view) => `${view.ticker}: ${view.headline} ${view.why}`);
  return {
    ...briefing,
    highlights: notes.length ? notes : ["No extra highlight is added. A probability is not shown."],
    keyObservations: briefing.keyObservations.filter((line) => !/confidence|strong buy|\bbuy\b|\bsell\b|conviction/i.test(line)),
    risks: briefing.risks.filter((line) => !/size positions|reduce\/sell|strong buy/i.test(line)),
    outlook: briefing.outlook.map((row) => ({ ...row, forecastView: views.get(row.ticker.toUpperCase()) })),
    overall: {
      ...briefing.overall,
      reason: "Model-fit scores are not probabilities. A frequency is shown only after resolved forecasts are on the track record.",
    },
  };
}

function pricesFrom(rows: SecurityIntel[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const row of rows) {
    if (row.price > 0) prices[row.ticker.toUpperCase()] = row.price;
  }
  return prices;
}

/** Attach the layer to the rows the caller already built. Logging follows the flags. */
export async function applyForecastLayer(input: {
  bot: "stox" | "koins";
  surface: ForecastSurface;
  assetClass: "stock" | "crypto";
  rows: SecurityIntel[];
  histories?: Record<string, number[]>;
  dexTickers?: ReadonlySet<string>;
  tickers?: TickerAnalysis[];
  leaders?: ProjectionRow[];
  briefing?: IntelligenceBriefing | null;
  nowMs?: number;
}): Promise<Map<string, ForecastView>> {
  const layer = forecastLayerEnabled();
  const log = forecastLogEnabled();
  if (!layer && !log) return new Map();
  let histories = input.histories;
  if (!histories) {
    const symbols = input.rows.map((row) => row.ticker);
    histories = symbols.length ? await fetchHistoriesForAssetClass(symbols, input.assetClass) : {};
  }
  const views = viewsForIntel({ ...input, histories });
  if (layer) {
    for (const row of input.rows) {
      const view = views.get(row.ticker.toUpperCase());
      if (view) row.forecastView = view;
    }
    for (const ticker of input.tickers || []) {
      const view = views.get(ticker.ticker.toUpperCase());
      if (view) ticker.forecastView = view;
    }
    for (const leader of input.leaders || []) {
      const view = views.get(leader.ticker.toUpperCase());
      if (view) leader.forecastView = view;
    }
    if (input.briefing) {
      const softened = softenBriefing(input.briefing, views);
      input.briefing.highlights = softened.highlights;
      input.briefing.keyObservations = softened.keyObservations;
      input.briefing.risks = softened.risks;
      input.briefing.outlook = softened.outlook;
      input.briefing.overall = softened.overall;
    }
  }
  if (log) {
    const nowMs = input.nowMs ?? Date.now();
    commitForecasts({
      forecasts: bodiesFromViews(input.bot, views, nowMs),
      nowMs,
      prices: pricesFrom(input.rows),
    });
  }
  return views;
}
