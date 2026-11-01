/** b90: FX-1 trade-date FX on import, H-9 golden cases, H-10 commit fixtures, M-2 /status times. pull-check:v3-b90-2026-10-29 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reviewedFxAllowed } from "@/lib/reviewed-book";

const read = (p: string) => readFileSync(p, "utf8");

describe("b90 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b96-2026-11-02");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b90-2026-10-29");
  });
});

// ECB reference rates to NZD (frankfurter.dev, read 29 Oct 2026).
const ECB: Record<string, number> = {
  "USD|2026-01-15": 1.7417, "USD|2026-01-20": 1.7137, "AUD|2026-03-02": 1.1888, "AUD|2026-03-20": 1.2062,
  "USD|2026-04-01": 1.7322, "USD|2026-03-02": 1.6848,
};

describe("b90 H-10 Sharesies, IBKR and Stake commit fixtures", () => {
  const cases = [
    { f: "sharesies-commit", c: "SHARESIES_COMMIT_FIXTURE", broker: "sharesies", rows: 3, cash: -402.5, hold: { "AAPL": 1, "AIR.NZ": 100 } },
    { f: "ibkr-commit", c: "IBKR_COMMIT_FIXTURE", broker: "ibkr", rows: 3, cash: -634.29, hold: { "BHP.AX": 6, NVDA: 2 } },
    { f: "stake-commit", c: "STAKE_COMMIT_FIXTURE", broker: "stake", rows: 2, cash: -228.29, hold: { AAPL: 1 } },
  ];
  it("hook serves each fixture and the constants equal the .csv files", async () => {
    const m = (await import("@/lib/fixtures/broker-import/preview-fixtures")) as unknown as Record<string, string>;
    const route = read("src/app/api/test-hooks/import-preview/route.ts");
    for (const k of cases) {
      expect(m[k.c]).toBe(read(`src/lib/import/fixtures/${k.f}.csv`));
      expect(m[k.c].startsWith("# EXAMPLE DATA.")).toBe(true);
      expect(route).toContain(`"${k.f}": () => ${k.c}`);
    }
  });
  it("preview totals match hand-worked NZ$ to the cent; every rate is within 5% of the trade-date rate", async () => {
    const { previewImport } = await import("@/lib/import/plan");
    for (const k of cases) {
      const p = await previewImport(read(`src/lib/import/fixtures/${k.f}.csv`));
      expect(p.broker).toBe(k.broker);
      expect(p.errors).toEqual([]);
      expect(p.toWrite.length).toBe(k.rows);
      expect(Math.abs((p as unknown as { cashNzd: number }).cashNzd - k.cash)).toBeLessThan(0.01);
      for (const r of p.toWrite) {
        if (r.currency === "NZD") continue;
        const dated = ECB[`${r.currency}|${r.date}`];
        expect(dated).toBeGreaterThan(0);
        expect(Math.abs(r.fx - dated) / dated).toBeLessThanOrEqual(0.05);
        // Passes the unchanged 5% check against the trade-date rate even when today's rate is 20% away.
        expect(reviewedFxAllowed({ currency: r.currency, reviewed: r.fx, snapshot: dated * 1.2, historical: dated }).ok).toBe(true);
      }
    }
  });
  it("commit then undo restores cash and holdings within NZ$0.01; a second upload is a duplicate", async () => {
    const { commitImport, emptyBook, undoImport } = await import("@/lib/import/book");
    for (const k of cases) {
      const book = emptyBook(1000);
      const text = read(`src/lib/import/fixtures/${k.f}.csv`);
      const out = await commitImport(book, text);
      expect(out.ok).toBe(true);
      expect(Math.abs(book.cashNzd - (1000 + k.cash))).toBeLessThan(0.01);
      for (const [t, q] of Object.entries(k.hold)) expect(book.holdings[t]).toBeCloseTo(q, 8);
      expect((await commitImport(book, text)).duplicate).toBe(true);
      expect(undoImport(book, out.batchId!).ok).toBe(true);
      expect(Math.abs(book.cashNzd - 1000)).toBeLessThan(0.01);
      expect(Object.values(book.holdings).every((q) => Math.abs(q) < 1e-8)).toBe(true);
    }
  });
  it("the live commit path fetches trade-date rates before booking", () => {
    const s = read("src/lib/import/persist.ts");
    expect(s).toContain("tradeDateFx[key] = await historicalNzdPerUnit(row.currency, row.date)");
    expect(s).toContain("trade_date_fx:");
  });
});

describe("b90 M-2 /status times", () => {
  it("exchange rates Last OK is the fetch time, with the provider's rate time beside it; share prices last saved row", () => {
    const s = read("src/lib/status-feeds.server.ts");
    expect(s).toContain("fx.fetchedAt ?? fx.asOf");
    expect(s).toContain("rates dated");
    expect(s).toContain('SHARE_PRICE_SAVED_LABEL = "Share prices last saved"');
    expect(read("src/lib/fx.ts")).toContain("fetchedAt: new Date(t).toISOString()");
  });
});
