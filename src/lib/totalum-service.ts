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
import { softenHeadmasterLanguage, type HeadmasterIdea } from "@/lib/headmaster-trust";

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

/** A named idea from a Stox or Koins report. Held vs not-held is explicit. */
export interface ReportBuy extends HeadmasterIdea {
  ticker: string;
  name: string;
  market: string; // "Stox (equities)" | "Koins (crypto)"
  projected7dPct: number;
  reason: string;
  held: boolean;
}

/** The latest Stox + Koins report findings, distilled for The Headmaster. */
export interface ReportFindings {
  hasStox: boolean;
  hasKoins: boolean;
  /** Held and not-held names. Callers must scope before showing not-held names. */
  ideas: ReportBuy[];
  /**
   * Held-first context. Does not list non-held tickers and does not instruct buys.
   * Watchlist ideas are opt-in via scopeHeadmasterIdeas.
   */
  contextBlock: string;
}

function stripMd(s: string): string {
  return (s || "").replace(/\*\*/g, "").replace(/_/g, "").trim();
}

function summariseReport(bot: BotKind, report: ApexReport, generatedAt: string): { text: string; ideas: ReportBuy[] } {
  const label = bot === "crypto" ? "KOINS (crypto)" : "STOX (equities)";
  const marketTag = bot === "crypto" ? "Koins (crypto)" : "Stox (equities)";

  const ideas: ReportBuy[] = (report.directRecommendations || []).map((r) => ({
    ticker: r.ticker,
    name: r.name,
    market: marketTag,
    projected7dPct: r.projected7dPct,
    reason: softenHeadmasterLanguage(stripMd(r.detail)).slice(0, 240),
    held: !!r.held,
  }));
  const heldNames = ideas.filter((r) => r.held).map((r) => r.ticker);

  const text = [
    `${label} report is available (generated ${generatedAt}).`,
    heldNames.length
      ? `- Held names mentioned in that report: ${heldNames.join(", ")}.`
      : "- That report did not list held names.",
    "- Use it as background for the current book. Non-held names stay off the default Headmaster plan.",
  ].join("\n");

  return { text, ideas };
}

/**
 * Loads the member's latest Stox AND Koins full reports as held-first context.
 * Non-held names are returned on `ideas` and stay out of `contextBlock`.
 * Non-fatal: on any read/parse failure the affected side is simply absent.
 */
export async function loadReportFindings(userId: string): Promise<ReportFindings> {
  const loadOne = async (bot: BotKind): Promise<{ text: string; ideas: ReportBuy[] } | null> => {
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

  const ideas = [...(stox?.ideas || []), ...(koins?.ideas || [])];
  const sections: string[] = [];
  if (stox) sections.push(stox.text);
  if (koins) sections.push(koins.text);

  const contextBlock = sections.length
    ? `LATEST STOX / KOINS CONTEXT (current holdings only — non-held names are withheld unless a watchlist was requested):\n\n${sections.join("\n\n")}`
    : "No Stox or Koins full reports have been generated yet. The Headmaster plan still covers the current book. Non-held names are not suggested by default.";

  console.log(
    `[totalum] Report findings ingested for user ${userId}: Stox=${!!stox}, Koins=${!!koins}, ${ideas.length} named ideas (${ideas.filter((i) => !i.held).length} not held, withheld from default context)`
  );

  return { hasStox: !!stox, hasKoins: !!koins, ideas, contextBlock };
}
