import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { shownTradePriceLabel, tradePriceHint } from "@/lib/trade-price-label";

describe("trade price label", () => {
  it("falls back to Price when the price, date, or asset changes", () => {
    expect(shownTradePriceLabel("2026-10-13T00:00:00.000Z", false)).toBe("Last close 13 Oct 2026");
    expect(shownTradePriceLabel("2026-10-13T00:00:00.000Z", false, "closed")).toBe("Last close 13 Oct 2026");
    expect(shownTradePriceLabel("2026-10-13T02:27:00.000Z", false, "open")).toMatch(/^Latest price /);
    expect(shownTradePriceLabel("2026-10-13T00:00:00.000Z", true, "open")).toBe("Price");
    expect(shownTradePriceLabel("", false, "open")).toBe("Price");
    expect(tradePriceHint({ priceDirty: false, session: "closed", quotedAt: "2026-10-13T00:00:00.000Z" })).toBe("Last close 13 Oct 2026 filled in");
    expect(tradePriceHint({ priceDirty: false, session: "open", quotedAt: "2026-10-13T02:27:00.000Z" })).toMatch(/^Latest price .+ filled in$/);
    expect(tradePriceHint({ priceDirty: true, session: "open", quotedAt: "2026-10-13T02:27:00.000Z" })).toBe("");

    const panel = readFileSync("src/components/dashboard/RecordTransactionPanel.tsx", "utf8");
    expect(panel).toContain("shownTradePriceLabel(priceAsAt, priceDirty, priceSession)");
    expect(panel).toContain("tradePriceHint");
    const dateHandler = panel.slice(panel.indexOf('id="record-date"'), panel.indexOf('id="record-qty"'));
    expect(dateHandler).toContain('setPriceAsAt("")');
    expect(dateHandler).toContain('setPriceSession("")');
    expect(dateHandler).toContain('setHint("")');
    const priceHandler = panel.slice(panel.indexOf('id="record-price"'), panel.indexOf('id="record-ccy"'));
    expect(priceHandler).toContain("setPriceDirty(true)");
    expect(priceHandler).toContain('setPriceAsAt("")');
    expect(priceHandler).toContain('setHint("")');
    const choose = panel.slice(panel.indexOf("function chooseAsset"), panel.indexOf("function chooseAsset") + 700);
    expect(choose).toContain('setPriceAsAt("")');
    expect(choose).toContain('setPriceSession("")');
    const change = panel.slice(panel.indexOf('className="text-xs font-semibold text-primary"'), panel.indexOf("\n                      Change"));
    expect(change).toContain('setPriceAsAt("")');
    expect(change).toContain("setAsset(null)");
    expect(panel).not.toContain("Today's price is filled in. You can type over it.");
    expect(panel).toContain("Loading cash…");
  });
});
