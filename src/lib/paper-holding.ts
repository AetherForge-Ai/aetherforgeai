export interface PaperHoldingChoice {
  ticker: string;
  name: string;
  assetType: "stock" | "crypto" | "metal";
  shares: number;
}
