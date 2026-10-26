import { describe, expect, it } from "vitest";
import { realisedByTaxYear } from "@/lib/tax-realised";
import { nzIncomeTax, previewSale, previewableHoldings } from "@/lib/tax-sale-preview";
import { taxSalePreviewEnabled } from "@/lib/feature-flags";
import type { TaxLedgerRow } from "@/lib/taxable-income";

const shares: TaxLedgerRow[] = [
  { type: "buy", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-05-01", quantity: 10, price: 2, currency: "NZD", fx_rate: 1 },
  { type: "buy", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-06-01", quantity: 10, price: 3, currency: "NZD", fx_rate: 1 },
] as TaxLedgerRow[];
const eth: TaxLedgerRow[] = [
  { type: "buy", ticker: "ETH", asset_type: "crypto", executed_at: "2026-04-02", quantity: 2, price: 100, currency: "USD", fx_rate: 1.6 },
] as TaxLedgerRow[];

describe("G-18 tax sale preview", () => {
  it("matches the /tax/realised engine for the same sale (FIFO shares)", () => {
    const p = previewSale(shares, { ticker: "fbu.nz", quantity: 15, price: 4, date: "2026-08-01" });
    const booked = realisedByTaxYear([...shares, { type: "sell", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-08-01", quantity: 15, price: 4, currency: "NZD", fx_rate: 1, fees_nzd: 0 } as TaxLedgerRow], 2027);
    expect(p.ok && p.realisedNzd).toBe(25);
    expect(p.ok && p.realisedNzd).toBe(booked.otherTotalNzd);
  });
  it("splits crypto price and FX gain in NZ$ like the realised page", () => {
    const p = previewSale(eth, { ticker: "ETH", quantity: 1, price: 150, fxRate: 1.7, date: "2026-09-01" });
    const booked = realisedByTaxYear([...eth, { type: "sell", ticker: "ETH", asset_type: "crypto", executed_at: "2026-09-01", quantity: 1, price: 150, currency: "USD", fx_rate: 1.7, fees_nzd: 0 } as TaxLedgerRow], 2027);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.realisedNzd).toBe(booked.cryptoTotalNzd);
    expect(p.pricePnlNzd + p.fxPnlNzd).toBeCloseTo(p.realisedNzd, 2);
    expect(p.taxYear).toMatch(/2027/);
  });
  it("NZ individual bands, to the cent, and no GST", () => {
    expect(nzIncomeTax(15_600)).toBe(1638);
    expect(nzIncomeTax(53_500)).toBe(8270.5);
    expect(nzIncomeTax(78_100)).toBe(15650.5);
    expect(nzIncomeTax(180_000)).toBe(49277.5);
    expect(nzIncomeTax(190_000)).toBe(53177.5);
    const p = previewSale(shares, { ticker: "FBU.NZ", quantity: 15, price: 4, date: "2026-08-01", otherIncomeNzd: 60_000 });
    expect(p.ok && p.taxEffectNzd).toBe(7.5);
    expect(p.ok && p.gstNzd).toBe(0);
  });
  it("fee reduces realised; loss shows offset; oversell and bad input refused", () => {
    const f = previewSale(shares, { ticker: "FBU.NZ", quantity: 15, price: 4, feeNzd: 5, date: "2026-08-01", otherIncomeNzd: 60_000 });
    expect(f.ok && f.realisedNzd).toBe(20);
    const l = previewSale(shares, { ticker: "FBU.NZ", quantity: 10, price: 1, date: "2026-08-01", otherIncomeNzd: 60_000 });
    expect(l.ok && l.taxEffectNzd).toBe(-3);
    expect(previewSale(shares, { ticker: "FBU.NZ", quantity: 21, price: 4 }).ok).toBe(false);
    expect(previewSale(shares, { ticker: "FBU.NZ", quantity: 0, price: 4 }).ok).toBe(false);
    expect(previewSale(eth, { ticker: "ETH", quantity: 1, price: 4, fxRate: 0 }).ok).toBe(false);
    expect(previewSale(eth, { ticker: "ETH", quantity: 1, price: 4 }).ok).toBe(true); // ledger rate
    expect(previewableHoldings(shares)).toEqual([{ ticker: "FBU.NZ", quantity: 20, currency: "NZD" }]);
  });
  it("flag is off unless TAX_SALE_PREVIEW=1", () => {
    expect(taxSalePreviewEnabled({})).toBe(false);
    expect(taxSalePreviewEnabled({ TAX_SALE_PREVIEW: "true" })).toBe(false);
    expect(taxSalePreviewEnabled({ TAX_SALE_PREVIEW: "1" })).toBe(true);
  });
});
