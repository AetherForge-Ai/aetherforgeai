import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planBrokerImport, rewriteKnownLayout } from "@/lib/broker-import";

/**
 * b51 H-10: the documented export layouts (src/lib/import/fixtures, see BROKER-CSV-COLUMNS.md) are
 * recognised and preview their trades in the live import parser. Synthetic fixtures; no real data.
 */
const read = (f: string) => readFileSync(`src/lib/import/fixtures/${f}.csv`, "utf8");
const plan = (f: string, rates: Record<string, number | null> = {}) => planBrokerImport(read(f), { fundBuys: true, reviewedRates: rates });
const nzd = (p: ReturnType<typeof planBrokerImport>) => p.rows.map((r) => Math.round((r.quantity * r.price + (r.side === "buy" ? r.fee : -r.fee)) * r.fx * 100) / 100);

describe("b51 H-10: export layouts preview their trades", () => {
  it("Hatch (verified layout): 2 trades; NZD values match the file's own Notional Value (NZD) columns", () => {
    const p = plan("hatch");
    expect(p.detection.broker).toBe("hatch");
    expect(p.rows.map((r) => [r.date, r.ticker, r.side, r.quantity, r.price, r.currency, r.fx])).toEqual([
      ["2026-03-02", "MSFT", "buy", 2, 100, "USD", 1.65],
      ["2026-03-03", "MSFT", "sell", 1, 110, "USD", 1.65],
    ]);
    expect(nzd(p)).toEqual([334.95, 176.55]); // buy 334.95 = file; sell 181.50 − 4.95 fee = 176.55 (file shows the gross plus fee, 186.45)
  });
  it("Swyftx (verified layout, both variants): 2 trades, the deposit is not a trade, AUD needs a rate", () => {
    for (const f of ["swyftx", "swyftx-no-tax"]) {
      const first = plan(f);
      expect(first.detection.broker).toBe("swyftx");
      expect(first.fxNeeds).toEqual([{ currency: "AUD", date: "2026-01-15" }, { currency: "AUD", date: "2026-02-20" }]);
      const p = plan(f, { "AUD|2026-01-15": 1.1, "AUD|2026-02-20": 1.1 });
      expect(p.rows.map((r) => [r.ticker, r.side, r.quantity, r.price, r.fee])).toEqual([
        ["BTC", "buy", 0.01, 100000, 6],
        ["BTC", "sell", 0.005, 110000, 3.3],
      ]);
      expect(p.unsupported.some((u) => /Deposit/.test(u.reason))).toBe(true);
    }
  });
  it("CommSec Confirmations: B/S rows read, ASX suffix, AUD at the reviewed rate", () => {
    const p = plan("commsec", { "AUD|2026-03-15": 1.1, "AUD|2026-06-16": 1.1 });
    expect(p.detection.broker).toBe("commsec");
    expect(p.rows.map((r) => [r.date, r.ticker, r.side, r.quantity, r.price, r.fee, r.currency])).toEqual([
      ["2026-03-15", "CBA.AX", "buy", 10, 100, 19.95, "AUD"],
      ["2026-06-16", "CBA.AX", "sell", 4, 110, 19.95, "AUD"],
    ]);
  });
  it("Jarden: 2 NZX trades; the buy's NZD equals the file's Net Amount (729.00)", () => {
    const p = plan("jarden");
    expect(p.detection.broker).toBe("jarden");
    expect(p.rows.map((r) => [r.date, r.ticker, r.side, r.quantity, r.price, r.fee])).toEqual([
      ["2026-02-03", "MFT.NZ", "buy", 10, 70, 29],
      ["2026-05-05", "MFT.NZ", "sell", 4, 75, 29],
    ]);
    expect(nzd(p)).toEqual([729, 271]); // file Net Amount 729.00 and 271.00
  });
  it("Easy Crypto: completed orders only (the pending one is left out); coin and NZD side from the order", () => {
    const p = plan("easycrypto");
    expect(p.detection.broker).toBe("easycrypto");
    expect(p.rows.map((r) => [r.date, r.ticker, r.side, r.quantity, r.price, r.fee, r.currency])).toEqual([
      ["2026-01-08", "BTC", "buy", 0.02, 100000, 20, "NZD"],
      ["2026-03-15", "BTC", "sell", 0.01, 110000, 11, "NZD"],
    ]);
  });
  it("other layouts are untouched", () => {
    const lines = ["Date,Type,Instrument code,Quantity,Price,Value,Currency", "2026-01-01,Buy,AIR,1,1,1,NZD"];
    expect(rewriteKnownLayout(lines)).toEqual({ lines, layout: null });
  });
});
