/** b93 H-10: ASB, Jarden, CommSec, Swyftx and Easy Crypto on the preview hook; commit, duplicate and undo to the cent. pull-check:v3-b93-2026-10-31 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b93 pins", () => {
  it("pins the build and keeps the b92 qa line", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b96-2026-11-02");
    const qa = read("qa/PULL-CHECK-2026-10-12.md");
    expect(qa).toContain("pull-check:v3-b93-2026-10-31 — b93:");
    expect(qa).toContain("pull-check:v3-b92-2026-10-31 — b92:");
  });
});

// ECB AUD->NZD reference rates (frankfurter.dev, read 31 Oct 2026). 15 Mar 2026 is a Sunday: the 13 Mar rate.
const RATES = { "AUD|2026-03-15": 1.2086, "AUD|2026-06-16": 1.213, "AUD|2026-01-15": 1.1648, "AUD|2026-02-20": 1.1836 };

// Hand-worked net cash in NZ$:
// ASB: -315.00 + 113.00 = -202.00. Jarden: -729.00 + 271.00 = -458.00.
// CommSec: -1019.95 × 1.2086 = -1232.71; +420.05 × 1.2130 = 509.52; net -723.19.
// Swyftx: -(1000.00 + 6.00) × 1.1648 = -1171.79; +(550.00 - 3.30) × 1.1836 = 647.07; net -524.72.
// Easy Crypto: -2020.00 + 1089.00 = -931.00 (the Pending order is not booked).
const cases = [
  { f: "asb", c: "ASB_FIXTURE", cash: -202, hold: { "FPH.NZ": 6 } },
  { f: "jarden", c: "JARDEN_FIXTURE", cash: -458, hold: { "MFT.NZ": 6 } },
  { f: "commsec", c: "COMMSEC_FIXTURE", cash: -723.19, hold: { "CBA.AX": 6 } },
  { f: "swyftx", c: "SWYFTX_FIXTURE", cash: -524.72, hold: { BTC: 0.005 } },
  { f: "easycrypto", c: "EASYCRYPTO_FIXTURE", cash: -931, hold: { BTC: 0.01 } },
];

describe("b93 H-10 remaining broker fixtures", () => {
  it("hook serves each fixture and each constant equals its .csv file", async () => {
    const m = (await import("@/lib/fixtures/broker-import/preview-fixtures")) as unknown as Record<string, string>;
    const route = read("src/app/api/test-hooks/import-preview/route.ts");
    for (const k of cases) {
      expect(m[k.c]).toBe(read(`src/lib/import/fixtures/${k.f}.csv`));
      expect(route).toContain(`"${k.f}": () => ${k.c}`);
    }
  });
  it("preview: right broker, no errors, cash to the cent", async () => {
    const { previewImport } = await import("@/lib/import/plan");
    for (const k of cases) {
      const p = await previewImport(read(`src/lib/import/fixtures/${k.f}.csv`), { reviewedRates: RATES });
      expect(p.broker).toBe(k.f);
      expect(p.errors).toEqual([]);
      expect(Math.abs((p as unknown as { cashNzd: number }).cashNzd - k.cash)).toBeLessThan(0.01);
    }
  });
  it("an AUD row with no rate is refused, never guessed", async () => {
    const { previewImport } = await import("@/lib/import/plan");
    const p = await previewImport(read("src/lib/import/fixtures/commsec.csv"));
    expect(p.toWrite.length).toBe(0);
    expect(p.errors[0].message).toContain("No rate was guessed");
  });
  it("commit, duplicate re-upload, undo: back to the opening cash and no holdings within NZ$0.01", async () => {
    const { commitImport, emptyBook, undoImport } = await import("@/lib/import/book");
    for (const k of cases) {
      const book = emptyBook(5000);
      const text = read(`src/lib/import/fixtures/${k.f}.csv`);
      const out = await commitImport(book, text, { reviewedRates: RATES });
      expect(out.ok).toBe(true);
      expect(Math.abs(book.cashNzd - (5000 + k.cash))).toBeLessThan(0.01);
      for (const [t, q] of Object.entries(k.hold)) expect(book.holdings[t]).toBeCloseTo(q, 8);
      expect((await commitImport(book, text, { reviewedRates: RATES })).duplicate).toBe(true);
      expect(undoImport(book, out.batchId!).ok).toBe(true);
      expect(Math.abs(book.cashNzd - 5000)).toBeLessThan(0.01);
      expect(Object.values(book.holdings).every((q) => Math.abs(q) < 1e-8)).toBe(true);
    }
  });
});
