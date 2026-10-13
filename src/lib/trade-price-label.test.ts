import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { shownTradePriceLabel } from "@/lib/trade-price-label";

describe("trade price label", () => {
  it("falls back to Price when the price, date, or asset changes", () => {
    expect(shownTradePriceLabel("2026-10-13T00:00:00.000Z", false)).toBe("Last close 13 Oct 2026");
    expect(shownTradePriceLabel("2026-10-13T00:00:00.000Z", true)).toBe("Price");
    expect(shownTradePriceLabel("", false)).toBe("Price");

    const panel = readFileSync("src/components/dashboard/RecordTransactionPanel.tsx", "utf8");
    expect(panel).toContain("shownTradePriceLabel(priceAsAt, priceDirty)");
    const dateHandler = panel.slice(panel.indexOf('id="record-date"'), panel.indexOf('id="record-qty"'));
    expect(dateHandler).toContain('setPriceAsAt("")');
    const priceHandler = panel.slice(panel.indexOf('id="record-price"'), panel.indexOf('id="record-ccy"'));
    expect(priceHandler).toContain("setPriceDirty(true)");
    expect(priceHandler).toContain('setPriceAsAt("")');
    const choose = panel.slice(panel.indexOf("function chooseAsset"), panel.indexOf("function chooseAsset") + 600);
    expect(choose).toContain('setPriceAsAt("")');
    const change = panel.slice(panel.indexOf('className="text-xs font-semibold text-primary"'), panel.indexOf("\n                      Change"));
    expect(change).toContain('setPriceAsAt("")');
    expect(change).toContain("setAsset(null)");
    expect(panel).toContain("Today's price is filled in. You can type over it.");
    expect(panel).toContain("Loading cash…");
  });
});
