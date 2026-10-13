import { formatNzd } from "@/lib/currency";
import { MISSING_MARK } from "@/lib/portfolio-snapshot";

export const DASHBOARD_TABS = ["holdings", "transactions", "income", "insights"] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DASHBOARD_TAB_LABEL: Record<DashboardTab, string> = {
  holdings: "Holdings",
  transactions: "Transactions",
  income: "Income & Tax",
  insights: "Insights",
};

export function readDashboardTab(params: URLSearchParams): DashboardTab {
  const tab = params.get("tab");
  if (tab === "transactions" || tab === "income" || tab === "insights" || tab === "holdings") return tab;
  return "holdings";
}

export function writeDashboardTab(params: URLSearchParams, tab: DashboardTab): void {
  if (tab === "holdings") params.delete("tab");
  else params.set("tab", tab);
}

export interface HoldingDeleteEffect {
  cashBefore: string;
  cashAfter: string;
  cashReason: string;
  unrealisedNow: string;
  unrealisedAfter: string;
  realisedNote: string;
}

/**
 * What Remove does today: the holding row leaves the book and no cash line is posted.
 * Figures come from the snapshot. A missing figure stays a dash.
 */
export function holdingDeleteEffect(input: {
  cash: number | null;
  unrealised: number | null;
  realised: number | null;
}): HoldingDeleteEffect {
  const cashKnown = input.cash != null && Number.isFinite(input.cash);
  const cashText = cashKnown ? formatNzd(input.cash as number) : MISSING_MARK;
  return {
    cashBefore: cashText,
    cashAfter: cashText,
    cashReason: cashKnown
      ? "Removing this holding does not post a cash line. Cash stays as it is."
      : "Cash was not on the snapshot.",
    unrealisedNow:
      input.unrealised != null && Number.isFinite(input.unrealised) ? formatNzd(input.unrealised) : MISSING_MARK,
    unrealisedAfter: MISSING_MARK,
    realisedNote:
      input.realised != null && Number.isFinite(input.realised)
        ? `Realised already on the ledger stays at ${formatNzd(input.realised)}.`
        : "Realised for this row was not on the snapshot. Ledger lines that are already stored stay.",
  };
}

export interface DividendDeleteEffect {
  cashBefore: string;
  lineImpact: string;
  cashAfter: string;
  reason: string;
}

/** A dividend delete reverses that line's cash. Both numbers have to be on the snapshot. */
export function dividendDeleteEffect(cash: number | null, lineCash: number | null): DividendDeleteEffect {
  const cashKnown = cash != null && Number.isFinite(cash);
  const lineKnown = lineCash != null && Number.isFinite(lineCash);
  if (!cashKnown || !lineKnown) {
    return {
      cashBefore: cashKnown ? formatNzd(cash as number) : MISSING_MARK,
      lineImpact: lineKnown ? formatNzd(lineCash as number) : MISSING_MARK,
      cashAfter: MISSING_MARK,
      reason: "Cash after this removal needs the snapshot cash and this line's cash impact.",
    };
  }
  return {
    cashBefore: formatNzd(cash as number),
    lineImpact: formatNzd(lineCash as number),
    cashAfter: formatNzd((cash as number) - (lineCash as number)),
    reason: "Cash after is the snapshot cash minus this dividend's cash impact.",
  };
}
