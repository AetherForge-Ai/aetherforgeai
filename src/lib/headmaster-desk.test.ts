import { describe, expect, it } from "vitest";
import { headmasterDeskCopy } from "@/lib/entitlements";

describe("Headmaster desk copy", () => {
  it("names Apex Dual without inventing a separate Pro SKU", () => {
    const dual = headmasterDeskCopy("dual_yearly");
    expect(dual.badge).toBe("Apex Dual");
    expect(dual.summary).toMatch(/Apex Dual/);
    expect(dual.detail).toMatch(/same desk/);
    expect(dual.detail).toMatch(/Strategy tab/);
    expect(dual.detail.toLowerCase()).not.toMatch(/new sku|stripe price/);
  });

  it("keeps Pro as the named full desk and free as a paid upsell", () => {
    expect(headmasterDeskCopy("pro_monthly").badge).toBe("Included");
    expect(headmasterDeskCopy("pro_yearly").summary).toMatch(/Full Headmaster/);
    expect(headmasterDeskCopy("free").badge).toBe("Pro");
    expect(headmasterDeskCopy(null).badge).toBe("Pro");
  });
});
