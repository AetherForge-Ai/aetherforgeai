import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewCashRefusal, PREVIEW_CASH_BELOW_ZERO } from "@/lib/import/cash-guard";
import { previewImport } from "@/lib/import/plan";
import { enforcedCsp } from "@/lib/security-headers";

describe("import preview cash refusal", () => {
  it("shows the below-zero refusal for Hatch before any row is saved", async () => {
    const text = readFileSync("src/lib/import/fixtures/hatch.csv", "utf8");
    const preview = await previewImport(text);
    expect(preview.toWrite).toHaveLength(2);
    expect(previewCashRefusal(preview.toWrite, 0)).toBe(PREVIEW_CASH_BELOW_ZERO);
    expect(previewCashRefusal(preview.toWrite, 100_000)).toBeNull();
    const page = readFileSync("src/app/import/import-client.tsx", "utf8");
    expect(page).toContain("import-cash-refusal");
    expect(page).toContain("!cashRefusal");
  });

  it("allows a sell that adds cash and blocks only a later reduction below zero", () => {
    const rows = [
      { cashEffectNzd: 50 },
      { cashEffectNzd: -40 },
      { cashEffectNzd: -20 },
    ];
    expect(previewCashRefusal(rows, 0)).toBe(PREVIEW_CASH_BELOW_ZERO);
    expect(previewCashRefusal(rows.slice(0, 2), 0)).toBeNull();
  });
});

describe("tesseract wasm is allowed by the page policy", () => {
  it("keeps wasm-unsafe-eval on script-src so the hosted LSTM core can compile", () => {
    const csp = enforcedCsp(false, "nonce");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain("unsafe-inline");
    const reader = readFileSync("src/lib/import/visual-reader.ts", "utf8");
    expect(reader).toContain('cacheMethod: "none"');
    expect(reader).toContain("gzip: true");
    expect(reader).toContain("/lang");
  });
});
