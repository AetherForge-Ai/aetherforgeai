/**
 * Allocation heading on the totals strip.
 * Stock and crypto hubs keep the active-bot wording. The metals hub must not
 * reuse "Stock allocation" just because the bot state was left on equities.
 */
export function hubAllocationLabel(view: string, bot: string): string {
  if (view === "metals") return "Metals allocation";
  return bot === "crypto" ? "Crypto allocation" : "Stock allocation";
}
