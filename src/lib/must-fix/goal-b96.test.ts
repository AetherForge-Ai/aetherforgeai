// pull-check:v3-b96-2026-11-02
import { describe, expect, it } from "vitest";
import data from "@/lib/import/fixtures/g24-visual/samples.json";
import { commitImport, emptyBook } from "@/lib/import/book";
import { PASTE_COLUMN_MAP, parsePastedTrades, pastedRowsToCsv, type PastedRow } from "@/lib/paste-import";

/**
 * b96 G-24: the 20-sample PDF/screenshot gate set. Every sample is clearly synthetic
 * ("Synthetic Test Broker", SYN- references). The text is what a PDF text layer or a
 * screenshot's text gives; the in-app reader stays parked, so this set is the bar it must pass.
 */
type Want = { date: string; type: string; ticker: string; quantity: number; price: number; currency: string; fees: number; reference: string };
const samples = data.samples as { id: string; kind: "pdf" | "screenshot"; text: string; expected: Want[] }[];
const same = (g: PastedRow | undefined, w: Want) =>
  !!g && g.date === w.date && g.type === w.type && g.ticker === w.ticker && g.quantity === w.quantity && g.price === w.price && g.currency === w.currency && g.fees === w.fees && g.reference === w.reference;

// Synthetic reviewed rates (NZ$ per unit), the ones a member confirms in review.
const RATE: Record<string, number> = { USD: 1.7, AUD: 1.1 };
function reviewedRates(rows: readonly PastedRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r.currency && r.currency !== "NZD" && r.date) out[`${r.currency}|${r.date}`] = RATE[r.currency];
  return out;
}

describe("b96 G-24 PDF/screenshot sample set", () => {
  it("has 20 clearly synthetic samples, half PDF and half screenshot", () => {
    expect(samples).toHaveLength(20);
    expect(samples.filter((s) => s.kind === "pdf")).toHaveLength(10);
    for (const s of samples) {
      expect(s.text).toContain("SYNTHETIC TEST BROKER");
      for (const w of s.expected) expect(w.reference).toMatch(/^SYN-/);
    }
  });

  it("reads at least 95% of rows correctly for review, in every field", () => {
    let ok = 0;
    let total = 0;
    for (const s of samples) {
      const { rows } = parsePastedTrades(s.text);
      s.expected.forEach((w, i) => {
        total += 1;
        if (same(rows[i], w)) ok += 1;
      });
      expect(rows.length).toBe(s.expected.length);
    }
    expect(total).toBe(100);
    expect(ok / total).toBeGreaterThanOrEqual(0.95);
  });

  it("saves nothing before review, and saves the reviewed rows only on confirm", async () => {
    for (const s of samples) {
      const book = emptyBook(1_000_000);
      for (const w of s.expected) book.holdings[w.ticker] = 1_000;
      const before = JSON.stringify(book);
      const { rows } = parsePastedTrades(s.text);
      const csv = pastedRowsToCsv(rows);
      // Reading and building the review table leave the book untouched.
      expect(JSON.stringify(book)).toBe(before);
      expect(book.batches).toHaveLength(0);
      // The member confirms: only now is anything written.
      const outcome = await commitImport(book, csv, { mapping: { ...PASTE_COLUMN_MAP }, reviewedRates: reviewedRates(rows) });
      expect(outcome.ok, `${s.id}: ${outcome.error}`).toBe(true);
      expect(outcome.written).toBeGreaterThanOrEqual(Math.ceil(s.expected.length * 0.95));
      expect(book.batches).toHaveLength(1);
    }
  });
});

import { readFileSync } from "node:fs";
const read = (f: string) => readFileSync(f, "utf8");

describe("b96 CLS-2 home ticker", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").split("\n")[0].trim()).toBe("v3-b96-2026-11-02");
  });
  it("gives the metals badge a fixed one-line box so late text can't re-wrap the band (768px)", () => {
    expect(read("src/components/MarketTicker.tsx")).toMatch(/inline-flex h-\[1\.125rem\] min-w-\[10\.5rem\][^"]*whitespace-nowrap/);
  });
  it("reserves the 302px narrow-phone ticker height below 390px (360px)", () => {
    for (const f of ["src/app/page.tsx", "src/components/LazyMarketTicker.tsx"]) {
      expect(read(f)).toMatch(/min-h-\[302px\] min-\[390px\]:min-h-\[284px\][^"]*md:min-h-\[201px\][^"]*lg:min-h-\[179px\]/);
    }
  });
});
