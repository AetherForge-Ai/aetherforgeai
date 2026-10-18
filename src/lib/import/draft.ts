import type { FxNeed, ImportRow, RowNote } from "@/lib/import/types";
import type { TradeBuild } from "@/lib/import/trade";

export interface BrokerDraft {
  rows: ImportRow[];
  errors: RowNote[];
  skipped: RowNote[];
  fxNeeds: FxNeed[];
}

export function emptyDraft(): BrokerDraft {
  return { rows: [], errors: [], skipped: [], fxNeeds: [] };
}

export function pushTrade(draft: BrokerDraft, built: TradeBuild): void {
  if (built.fxNeed && !draft.fxNeeds.some((need) => need.currency === built.fxNeed?.currency && need.date === built.fxNeed.date)) {
    draft.fxNeeds.push(built.fxNeed);
  }
  if (built.error) draft.errors.push(built.error);
  else if (built.row) draft.rows.push(built.row);
}

export function skip(draft: BrokerDraft, line: number, message: string): void {
  draft.skipped.push({ line, message: `Line ${line}: ${message}` });
}
