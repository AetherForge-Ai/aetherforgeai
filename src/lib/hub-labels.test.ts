import { describe, expect, it } from "vitest";
import { hubAllocationLabel } from "@/lib/hub-labels";

describe("hub allocation label", () => {
  it("names the metals hub without borrowing the stock label", () => {
    expect(hubAllocationLabel("metals", "stock")).toBe("Metals allocation");
    expect(hubAllocationLabel("metals", "crypto")).toBe("Metals allocation");
  });

  it("keeps the stock and crypto labels tied to the active bot", () => {
    expect(hubAllocationLabel("stocks", "stock")).toBe("Stock allocation");
    expect(hubAllocationLabel("crypto", "crypto")).toBe("Crypto allocation");
    expect(hubAllocationLabel("cash", "stock")).toBe("Stock allocation");
    expect(hubAllocationLabel("bots", "crypto")).toBe("Crypto allocation");
  });
});
