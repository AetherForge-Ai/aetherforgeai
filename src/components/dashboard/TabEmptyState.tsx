import type { ReactNode } from "react";

/** M-8: one empty state per dashboard tab. No sample or placeholder figures. */
export const TAB_EMPTY_COPY: Record<string, { title: string; body: string }> = {
  holdings: { title: "No holdings yet", body: "Shares, crypto and metals show here after your first buy. Cash stays on its own row." },
  transactions: { title: "No transactions yet", body: "Every buy, sell, dividend and cash move is listed here once you record it." },
  income: { title: "No income or tax figures yet", body: "Dividends, realised gains and the FIF view appear after you record trades or dividends." },
  insights: { title: "No insights yet", body: "Allocation, drift and report ideas are worked out from your own holdings, so add one first." },
};

export function isEmptyBook(snapshot: { ledger?: readonly unknown[]; groups?: readonly { positions?: readonly unknown[] }[] } | null | undefined): boolean {
  if (!snapshot) return false;
  const rows = (snapshot.groups || []).reduce((n, g) => n + (g.positions?.length || 0), 0);
  return rows === 0 && (snapshot.ledger?.length || 0) === 0;
}

export function TabEmptyState({ tab, action }: { tab: keyof typeof TAB_EMPTY_COPY | string; action?: ReactNode }) {
  const copy = TAB_EMPTY_COPY[tab] || TAB_EMPTY_COPY.holdings;
  return (
    <div className="mt-3 rounded-3xl border border-dashed border-border/70 bg-card/40 p-5" data-empty-tab={tab}>
      <h2 className="text-base font-semibold">{copy.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
