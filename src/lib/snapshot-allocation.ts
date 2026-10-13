import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";

export interface AllocationShare {
  id: string;
  label: string;
  display: string;
  /** 0–1 share of net worth. Null when either figure is missing. */
  share: number | null;
  reason: string | null;
}

/** Bar widths from the snapshot group values and net worth. No second total. */
export function allocationShares(snapshot: PortfolioSnapshot): AllocationShare[] {
  const total = snapshot.kpis.netWorth.value;
  return snapshot.groups.map((group) => {
    const value = group.marketValue.value;
    if (value == null) {
      return {
        id: group.id,
        label: group.label,
        display: group.marketValue.display,
        share: null,
        reason: group.marketValue.reason || "This class has no market value on the snapshot.",
      };
    }
    if (total == null || !(total > 0)) {
      return {
        id: group.id,
        label: group.label,
        display: group.marketValue.display,
        share: null,
        reason: snapshot.kpis.netWorth.reason || "Net worth was not on the snapshot.",
      };
    }
    return {
      id: group.id,
      label: group.label,
      display: group.marketValue.display,
      share: value / total,
      reason: null,
    };
  });
}
