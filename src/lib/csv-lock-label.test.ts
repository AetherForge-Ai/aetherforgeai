import { describe, expect, it } from "vitest";
import { CSV_LOCK_LABEL, csvLockAccessibleName } from "./csv-lock-label";

describe("CSV lock label", () => {
  it("uses the Free-plan wording and names the export", () => {
    expect(CSV_LOCK_LABEL).toBe("Export CSV — Starter and above");
    expect(csvLockAccessibleName("Dividends CSV")).toBe(
      "Dividends CSV: Export CSV — Starter and above"
    );
    expect(csvLockAccessibleName("")).toBe(CSV_LOCK_LABEL);
  });
});
