/** Shares and ETFs are dividends. Crypto, metal and cash are income. The ledger type stays dividend. */
export function distributionLabel(assetType?: string | null): "Dividend" | "Income" {
  const kind = (assetType || "").toLowerCase();
  if (kind === "stock" || kind === "equity" || kind === "etf" || kind === "share" || kind === "shares") {
    return "Dividend";
  }
  return "Income";
}
