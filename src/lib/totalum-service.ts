import "server-only";

/**
 * Server-side glue for The Headmaster: loads a member's full cross-asset book
 * (equities + crypto from `stock`, physical metals from `precious_metal`, plus
 * ledger `cash_balance`), resolves live metals spot + FX, and runs the pure
 * `totalum-engine` synthesis. Cash-only books are valid (not empty).
 *
 * Kept separate from the route so both the synthesis endpoint and the Chief
 * Strategist chat endpoint share exactly the same portfolio picture.
 */

import { totalumSdk } from "@/lib/totalum";
import { getMetalsSpot } from "@/lib/metals";
import { getFxSnapshot } from "@/lib/fx";
import type { Stock } from "@/lib/portfolio";
import type { ApexReport, BotKind } from "@/lib/apex";
import {
  buildSynthesis,
  type MetalHolding,
  type TotalumSynthesis,
} from "@/lib/totalum-engine";

export async function loadTotalumSynthesis(userId: string): Promise<TotalumSynthesis> {
  const [stocksRes, metalsRes, userRes, spot, fx] = await Promise.all([
    totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 }),
    totalumSdk.crud.query("precious_metal", { _filter: { user: userId }, _limit: 200 }),
    totalumSdk.crud.getRecordById("user", userId).catch((err: unknown) => {
      console.error("[totalum] Failed to load user cash_balance (non-fatal):", err);
      return null;
    }),
    getMetalsSpot(),
    getFxSnapshot(),
  ]);

  const stocks = ((stocksRes?.data as any[]) || []) as Stock[];
  const metals = ((metalsRes?.data as any[]) || []) as MetalHolding[];
  const userRec = (userRes as any)?.data ?? userRes;
  const cashBalanceNZD =
    typeof userRec?.cash_balance === "number" && isFinite(userRec.cash_balance)
      ? Math.max(0, userRec.cash_balance)
      : 0;

  console.log(
    `[totalum] Synthesising user ${userId}: ${stocks.length} securities, ${metals.length} metal holdings, cash NZ$${Math.round(cashBalanceNZD)} (spot live=${spot.live}, fx live=${fx.live})`
  );

  return buildSynthesis({
    stocks,
    metals,
    spot,
    fxToNZD: fx.ratesToNZD,
    cashBalanceNZD,
  });
}

/* ------------------------ Report-findings ingestion --------------------- */

/** One concrete BUY drawn from a bot's latest full report. */
export interface ReportBuy {
  ticker: string;
  name: string;
  market: string; // "Stox (equities)" | "Koins (crypto)"
  projected7dPct: number;
  reason: string;
}

/** The latest Stox + Koins report findings, distilled for The Headmaster. */
export interface ReportFindings {
  hasStox: boolean;
  hasKoins: boolean;
  /** Buy list combined across both reports (specific tickers to BUY). */
  buys: ReportBuy[];
  /** Rich, AI-ready context block summarising both reports. */
  contextBlock: string;
}

function stripMd(s: string): string {
  return (s || "").replace(/\*\*/g, "").replace(/_/g, "").trim();
}

function summariseReport(bot: BotKind, report: ApexReport, generatedAt: string): { text: string; buys: ReportBuy[] } {
  const label = bot === "crypto" ? "KOINS (crypto)" : "STOX (equities)";
  const marketTag = bot === "crypto" ? "Koins (crypto)" : "Stox (equities)";

  const leaders = (report.projectionLeaders || [])
    .slice(0, 8)
    .map((p) => `${p.ticker} ${p.projected7dPct >= 0 ? "+" : ""}${p.projected7dPct}% (${p.signal}) @ ${p.confidence}% conf`)
    .join(", ") || "none";

  const recBuys = (report.directRecommendations || []).filter(
    (r) => !r.held && (r.action === "BUY" || r.action === "ACCUMULATE")
  );
  const buys: ReportBuy[] = recBuys.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    market: marketTag,
    projected7dPct: r.projected7dPct,
    reason: stripMd(r.detail),
  }));
  const buyLine =
    recBuys
      .map(
        (r) =>
          `${r.action} ${r.ticker} (${r.name}) ${r.projected7dPct >= 0 ? "+" : ""}${r.projected7dPct}% 7d — ${stripMd(r.detail).slice(0, 120)}`
      )
      .join("; ") || "none flagged";

  const exec = stripMd(report.executiveSummary || "").slice(0, 420);

  const text = [
    `${label} FULL REPORT — latest, generated ${generatedAt}:`,
    exec ? `- Executive read: ${exec}` : "",
    `- Top 7-day projected leaders: ${leaders}`,
    `- Specific ticker-level BUY/ACCUMULATE list (use these when cash is available to deploy): ${buyLine}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { text, buys };
}

/**
 * Loads the member's latest Stox AND Koins full reports and distils their
 * projections + specific BUY recommendations so The Headmaster can factor
 * BOTH report systems into a more specific, in-depth strategic plan. Non-fatal:
 * on any read/parse failure the affected side is simply reported as absent.
 */
export async function loadReportFindings(userId: string): Promise<ReportFindings> {
  const loadOne = async (bot: BotKind): Promise<{ text: string; buys: ReportBuy[] } | null> => {
    try {
      const res = await totalumSdk.crud.query("report", {
        _filter: { user: userId, bot },
        _sort: { createdAt: "desc" },
        _limit: 1,
      });
      const row = (res?.data as any[])?.[0];
      if (!row?.payload) return null;
      const report = JSON.parse(row.payload) as ApexReport;
      const when = row.generated_at || row.createdAt || "recently";
      return summariseReport(bot, report, when);
    } catch (err) {
      console.error(`[totalum] Failed to load ${bot} report findings (non-fatal):`, err);
      return null;
    }
  };

  const [stox, koins] = await Promise.all([loadOne("stock"), loadOne("crypto")]);

  const buys = [...(stox?.buys || []), ...(koins?.buys || [])];
  const sections: string[] = [];
  if (stox) sections.push(stox.text);
  if (koins) sections.push(koins.text);

  const contextBlock = sections.length
    ? `LATEST FULL-REPORT FINDINGS (ingested from the member's own Stox & Koins reports — prefer these named tickers when deploying cash):\n\n${sections.join("\n\n")}`
    : "No Stox or Koins full reports have been generated yet — encourage the member to run both (even with cash-only / empty holdings) so The Headmaster can factor their ticker-level BUY lists into the plan.";

  console.log(
    `[totalum] Report findings ingested for user ${userId}: Stox=${!!stox}, Koins=${!!koins}, ${buys.length} specific buys`
  );

  return { hasStox: !!stox, hasKoins: !!koins, buys, contextBlock };
}
