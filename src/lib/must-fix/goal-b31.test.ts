// pull-check:v3-goal-b31-2026-10-19
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
const read = (p: string) => readFileSync(p, "utf8");

describe("b31 version bump", () => {
  it("marker and pull-check line", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d)-b(3[1-9]|[4-9]\d)[a-z]?-/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b31-2026-10-19");
  });
});

describe("b31 H-10 import hardening", () => {
  it("strips formula characters and keys trades across files", async () => {
    vi.doMock("@/lib/transactions", () => ({ applyTransaction: vi.fn() }));
    vi.doMock("@/lib/totalum", () => ({ totalumSdk: {} }));
    const { safeImportText, tradeKey, IMPORT_WRITE_LIMIT } = await import("@/lib/import/persist");
    expect(safeImportText("=HYPERLINK(\"x\")")).toBe("HYPERLINK(\"x\")");
    expect(safeImportText("+cmd")).toBe("cmd");
    expect(safeImportText("Fisher & Paykel")).toBe("Fisher & Paykel");
    expect(tradeKey({ ticker: "fph", side: "buy", quantity: 10, price: 30, date: "2026-03-02" })).toBe(
      tradeKey({ ticker: "FPH", type: "buy", quantity: 10, price: 30, executed_at: "2026-03-02" })
    );
    expect(IMPORT_WRITE_LIMIT).toBeGreaterThan(0);
  });
  it("imports go through applyTransaction (book-version bump) and are rate limited", () => {
    const src = read("src/lib/import/persist.ts");
    expect(src).toContain("await applyTransaction(user");
    expect(src).toContain("takeRateLimit(`import:${user._id}`");
    expect(src).toContain("Math.round(row.cashEffectNzd * 100)");
    expect(read("src/lib/transactions.ts")).toContain('import "@/lib/book-version.server"');
    expect(read("src/lib/book-write-mark.ts")).toMatch(/\\\/api\\\/import/);
  });
});

describe("b31 G-10 optimistic Confirm", () => {
  it("paints on Confirm, keeps the dialog open, rolls back on refusal", () => {
    const src = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(src).toContain("const optimistic = true as boolean;");
    expect(src).toContain("optimisticRollback: true");
    const paint = src.indexOf("optimistic: true });");
    const close = src.indexOf("onRequestClose();", paint);
    const post = src.indexOf('api.post("/api/transactions", payload)', paint);
    expect(post).toBeGreaterThan(paint);
    expect(close).toBeGreaterThan(post);
  });
});
