import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fxRateLines, PDF_WRAP_CHARS, taxPaperPdf, wrapPdfLine } from "@/lib/tax-pack";

const hasPdftotext = (() => {
  try {
    execSync("command -v pdftotext", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const DE_MINIMIS =
  "Your peak FIF cost was under NZ$50,000 for the whole tax year, so the de minimis exemption is likely to apply and FIF income can be left out by an individual; check with your accountant before relying on it.";

describe("b26 H-9 PDF wrapping", () => {
  it("wraps every line inside the margin and keeps every word", () => {
    const wrapped = wrapPdfLine(DE_MINIMIS);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const l of wrapped) expect(l.length).toBeLessThanOrEqual(PDF_WRAP_CHARS);
    expect(wrapped.join(" ").replace(/\s+/g, " ").trim()).toBe(DE_MINIMIS);
  });

  it("lists FX rates with source and date", () => {
    const lines = fxRateLines([{ ticker: "AAPL", type: "buy", currency: "USD", fx_rate: 1.75, fx_source: "Frankfurter (ECB reference)", executed_at: "2026-05-12T00:00:00Z" }]);
    expect(lines[0]).toBe("FX rates used");
    expect(lines[1]).toBe("AAPL buy 2026-05-12: 1.7500 NZD per USD, source Frankfurter (ECB reference)");
  });

  it.skipIf(!hasPdftotext)("pdftotext shows the full de minimis sentence, the tax year and multiple pages", () => {
    const many = Array.from({ length: 60 }, (_, i) => `Row ${i + 1}`);
    const pdf = taxPaperPdf({ title: "NZ tax pack", taxYear: "1 Apr 2026 - 31 Mar 2027", lines: [DE_MINIMIS, ...many], endingYear: 2027 });
    const dir = mkdtempSync(join(tmpdir(), "h9-"));
    const file = join(dir, "pack.pdf");
    writeFileSync(file, pdf, "latin1");
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
    expect(text).toContain(DE_MINIMIS);
    expect(text).toContain("Row 60");
    expect(text).toContain("Page 2 of");
    expect(text).toContain("Indicative");
  });
});
