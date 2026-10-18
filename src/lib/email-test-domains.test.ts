import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isTestEmailAddress } from "./email-test-domains";

describe("b22 test-address guard", () => {
  it("matches only example.test / example.invalid", () => {
    expect(isTestEmailAddress("fixture-a@example.test")).toBe(true);
    expect(isTestEmailAddress("X@EXAMPLE.INVALID")).toBe(true);
    expect(isTestEmailAddress("admin@aetherforgeai.co.nz")).toBe(false);
    expect(isTestEmailAddress("a@example.testing.com")).toBe(false);
    expect(isTestEmailAddress(undefined)).toBe(false);
  });
  it("both senders check it before sending", () => {
    for (const f of ["src/lib/weekly-email-live.ts", "src/lib/product-note-live.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s.indexOf("isTestEmailAddress)")).toBeGreaterThan(0);
      expect(s.indexOf("isTestEmailAddress)")).toBeLessThan(s.indexOf("await sendTransactionalEmail("));
    }
  });
});
