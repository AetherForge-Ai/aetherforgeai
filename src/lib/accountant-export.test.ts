import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaxPageContent } from "@/components/tax/TaxPageContent";
import { csvEscape } from "@/lib/csv-cell";
import { buildDividendRecord, dividendNotesPrefix } from "@/lib/dividend-ledger";
import { moneyCell } from "@/lib/currency";
import { crc32 } from "@/lib/zip-store";
import {
  ACCOUNTANT_PACK_LABEL,
  DIVIDEND_COLUMNS,
  HOLDINGS_COLUMNS,
  TRANSACTION_COLUMNS,
  buildAccountantPack,
  buildAccountantZip,
  formatNzGeneratedAt,
  resolveAccountantRange,
  rowsOwnedBy,
  selectAccountantRows,
  type AccountantLedgerRow,
} from "@/lib/accountant-export";

const GENERATED = "2026-11-23T06:00:00.000Z";

function notes(input: Parameters<typeof buildDividendRecord>[0]) {
  const built = buildDividendRecord(input);
  if (!built.ok) throw new Error(built.message);
  return { notes: dividendNotesPrefix(built.parts), parts: built.parts };
}

function line(cells: readonly string[]): string {
  return cells.map((cell) => csvEscape(cell)).join(",");
}

describe("accountant export builders", () => {
  const fphDiv = notes({ grossNative: 100, imputationNzd: 28, withholdingNative: 33, drpNative: 0, currency: "NZD", fx: 1 });
  const aaplDiv = notes({ grossNative: 10, imputationNzd: 0, withholdingNative: 1.5, drpNative: 0, currency: "USD", fx: 1.7 });
  const rows: AccountantLedgerRow[] = [
    { _id: "air-buy", user: "user-a", type: "buy", ticker: "AIR.NZ", asset_name: "Air New Zealand", quantity: 1, price: 4, fill_price: 4, currency: "NZD", fx_rate: 1, trade_date: "2026-03-15", executed_at: "2026-03-15", cash_nzd: -4 },
    { _id: "fph-buy", user: "user-a", type: "buy", ticker: "FPH.NZ", asset_name: "Fisher and Paykel", quantity: 10, price: 5, fill_price: 5, currency: "NZD", fx_rate: 1, fees_nzd: 2.5, trade_date: "2026-04-15", executed_at: "2026-04-15", cash_nzd: -52.5 },
    { _id: "aapl-1", user: "user-a", type: "buy", ticker: "AAPL", asset_name: "Apple", quantity: 2, price: 100, fill_price: 100, currency: "USD", fx_rate: 1.7, fx_source: "stored", trade_date: "2026-05-01", executed_at: "2026-05-01", cash_nzd: -340 },
    { _id: "fph-sell", user: "user-a", type: "sell", ticker: "FPH.NZ", quantity: 4, price: 6, fill_price: 6, currency: "NZD", fx_rate: 1, fees_nzd: 1, trade_date: "2026-05-20", executed_at: "2026-05-20", cash_nzd: 23 },
    { _id: "aapl-2", user: "user-a", type: "buy", ticker: "AAPL", asset_name: "Apple", quantity: 1, price: 110, fill_price: 110, currency: "USD", fx_rate: 1.72, trade_date: "2026-06-01", executed_at: "2026-06-01", fees: 2, cash_nzd: -189.2 },
    { _id: "div-fph", user: "user-a", type: "dividend", ticker: "FPH.NZ", currency: "NZD", fx_rate: 1, trade_date: "2026-06-01", executed_at: "2026-06-01", cash_nzd: 67, notes: fphDiv.notes },
    { _id: "div-aapl", user: "user-a", type: "dividend", ticker: "AAPL", currency: "USD", fx_rate: 1.7, fx_timestamp: "2026-06-15T02:00:00.000Z", trade_date: "2026-06-15", executed_at: "2026-06-15", cash_nzd: 14.45, notes: aaplDiv.notes },
    { _id: "div-legacy", user: "user-a", type: "dividend", ticker: "AIR.NZ", trade_date: "2026-06-20", executed_at: "2026-06-20", cash_nzd: 1.5 },
    { _id: "spark-buy", user: "user-a", type: "buy", ticker: "SPK.NZ", quantity: 8, price: 3, fill_price: 3, currency: "NZD", fx_rate: 1, trade_date: "2026-07-01", executed_at: "2026-07-01", cash_nzd: -24 },
    { _id: "fee-1", user: "user-a", type: "fee", trade_date: "2026-07-02", executed_at: "2026-07-02", cash_nzd: -3.5 },
    { _id: "tax-1", user: "user-a", type: "tax", trade_date: "2026-08-15", executed_at: "2026-08-15", cash_nzd: -1 },
    { _id: "foreign", user: "user-b", type: "buy", ticker: "ZZZZ.NZ", quantity: 99, price: 9, currency: "NZD", fx_rate: 1, trade_date: "2026-04-15", executed_at: "2026-04-15", cash_nzd: -891 },
  ];

  const range = resolveAccountantRange({ asOf: "2026-06-30", from: "2026-04-01", to: "2027-03-31" }, "2026-11-23");
  if (!range.ok) throw new Error(range.error);

  const pack = buildAccountantPack({
    rows: rowsOwnedBy(rows, "user-a"),
    marks: [
      { ticker: "FPH.NZ", price: 6, asOf: "2026-06-30" },
      { ticker: "AAPL", price: 120, asOf: "2026-06-20" },
      { ticker: "AIR.NZ", price: 5, asOf: "2026-08-01" },
    ],
    range: range.range,
    generatedAt: GENERATED,
  });

  it("uses stable headers, the cover label, the tax year and documents every column", () => {
    expect(pack.holdings.startsWith(`\uFEFF${HOLDINGS_COLUMNS.join(",")}\n`)).toBe(true);
    expect(pack.transactions.startsWith(`\uFEFF${TRANSACTION_COLUMNS.join(",")}\n`)).toBe(true);
    expect(pack.dividends.startsWith(`\uFEFF${DIVIDEND_COLUMNS.join(",")}\n`)).toBe(true);
    expect(pack.readme.startsWith("AetherForge")).toBe(true);
    expect(pack.readme).toContain(ACCOUNTANT_PACK_LABEL);
    expect(pack.readme).toContain(`Generated at: ${formatNzGeneratedAt(new Date(GENERATED))}`);
    expect(pack.readme).toContain("NZ tax year: 1 Apr 2026 to 31 Mar 2027");
    expect(pack.readme).toContain("The New Zealand tax year runs from 1 Apr to 31 Mar.");
    expect(pack.readme).toContain("Share with accountant: future work.");
    expect(pack.readme).toContain("This pack does not include FIF or IR3 calculations.");
    for (const column of HOLDINGS_COLUMNS) expect(pack.readme).toContain(`holdings.csv | ${column}:`);
    for (const column of TRANSACTION_COLUMNS) expect(pack.readme).toContain(`transactions.csv | ${column}:`);
    for (const column of DIVIDEND_COLUMNS) expect(pack.readme).toContain(`dividends.csv | ${column}:`);
    expect(pack.holdings).not.toMatch(/FIF|IR3|FDR/);
    expect(pack.transactions).not.toMatch(/FIF|IR3|FDR/);
    expect(pack.dividends).not.toMatch(/FIF|IR3|FDR/);
  });

  it("builds holdings at the chosen date from stored cost, price and FX", () => {
    const lines = pack.holdings.trim().split("\n").slice(1);
    expect(lines).toEqual([
      line(["AAPL", "Apple", "3", "USD", "529.20", "", "", "2026-05-01 1.7000; 2026-06-01 1.7200", "", "", "", "2026-06-20", "No exchange rate is stored for this price, so market value in NZD is blank."]),
      line(["AIR.NZ", "Air New Zealand", "1", "NZD", "4.00", "1.0000", "2026-03-15", "2026-03-15 1.0000", "", "", "", "2026-08-01", "Stored price is dated after the holdings date, so market value is blank."]),
      line(["FPH.NZ", "Fisher and Paykel", "6", "NZD", "30.00", "1.0000", "2026-04-15", "2026-04-15 1.0000", "36.00", "1.0000", "2026-06-30", "2026-06-30", ""]),
    ]);
    expect(pack.holdings).not.toContain("SPK.NZ");
    expect(pack.holdings).not.toContain("ZZZZ.NZ");
  });

  it("lists buys, sells, dividends and fees in the date range, with NZD to two decimals", () => {
    const lines = pack.transactions.trim().split("\n").slice(1);
    expect(lines.map((row) => row.split(",")[0] + " " + row.split(",")[1] + " " + row.split(",")[11])).toEqual([
      "2026-04-15 buy fph-buy",
      "2026-05-01 buy aapl-1",
      "2026-05-20 sell fph-sell",
      "2026-06-01 buy aapl-2",
      "2026-06-01 dividend div-fph",
      "2026-06-15 dividend div-aapl",
      "2026-06-20 dividend div-legacy",
      "2026-07-01 buy spark-buy",
      "2026-07-02 fee fee-1",
      "2026-08-15 tax tax-1",
    ]);
    const fphBuy = lines[0].split(",");
    expect(fphBuy[9]).toBe("2.50");
    expect(fphBuy[10]).toBe("-52.50");
    const aapl2 = lines.find((row) => row.endsWith("aapl-2"))?.split(",") ?? [];
    expect(aapl2[6]).toBe("1.7200");
    expect(aapl2[9]).toBe(moneyCell(2 * 1.72));
    const aaplDivRow = lines.find((row) => row.endsWith("div-aapl"))?.split(",") ?? [];
    expect(aaplDivRow[7]).toBe("2026-06-15");
    expect(aaplDivRow[8]).toBe("");
    expect(lines.find((row) => row.endsWith("fee-1"))?.split(",")[10]).toBe("-3.50");
    expect(pack.transactions).not.toContain("air-buy");
    expect(pack.transactions).not.toContain("ZZZZ.NZ");
    for (const row of lines) {
      const cells = row.split(",");
      for (const money of [cells[9], cells[10]]) {
        if (money) expect(money).toMatch(/^-?\d+\.\d{2}$/);
      }
      if (cells[6]) expect(cells[6]).toMatch(/^\d+\.\d{4}$/);
    }
  });

  it("exports stored imputation, RWT and foreign tax without calculating them", () => {
    const lines = pack.dividends.trim().split("\n").slice(1);
    expect(lines).toHaveLength(3);
    const fph = lines[0].split(",");
    expect(fph[0]).toBe("2026-06-01");
    expect(fph[1]).toBe("FPH.NZ");
    expect(fph[4]).toBe(moneyCell(fphDiv.parts.grossNzd));
    expect(fph[5]).toBe(moneyCell(fphDiv.parts.imputationNzd));
    expect(fph[6]).toBe(moneyCell(fphDiv.parts.withholdingNzd));
    expect(fph[7]).toBe("");
    expect(fph[8]).toBe(moneyCell(fphDiv.parts.netCashNzd));
    expect(fph[9]).toBe("stored");
    const aapl = lines[1].split(",");
    expect(aapl[6]).toBe("");
    expect(aapl[7]).toBe(moneyCell(aaplDiv.parts.withholdingNzd));
    expect(aapl[5]).toBe("0.00");
    expect(aapl[8]).toBe(moneyCell(aaplDiv.parts.netCashNzd));
    const legacy = lines[2];
    expect(legacy.startsWith("2026-06-20,AIR.NZ,")).toBe(true);
    expect(legacy).toContain(",1.50,");
    expect(legacy).toContain('"cash only, no tax breakdown stored"');
    expect(legacy).not.toContain("0.00");
  });

  it("inverts a USD rate stored below 1, matching the rate the book uses", () => {
    const resolved = resolveAccountantRange({ asOf: "2026-05-01", from: "2026-04-01", to: "2026-05-02" }, "2026-11-23");
    if (!resolved.ok) throw new Error(resolved.error);
    const built = buildAccountantPack({
      rows: [{ _id: "usd", type: "buy", ticker: "MSFT", quantity: 1, price: 100, currency: "USD", fx_rate: 0.5, trade_date: "2026-05-01", executed_at: "2026-05-01" }],
      range: resolved.range,
      generatedAt: GENERATED,
    });
    const holding = built.holdings.replace(/^\uFEFF/, "").trim().split("\n")[1].split(",");
    expect(holding[4]).toBe("200.00");
    expect(holding[5]).toBe("2.0000");
    expect(built.transactions).toContain("2.0000");
  });

  it("handles an empty book with headers and the cover sheet", () => {
    const resolved = resolveAccountantRange({}, "2026-11-23");
    if (!resolved.ok) throw new Error(resolved.error);
    const empty = buildAccountantPack({ rows: [], range: resolved.range, generatedAt: GENERATED });
    expect(empty.holdings.replace(/^\uFEFF/, "").trim().split("\n")).toEqual([HOLDINGS_COLUMNS.join(",")]);
    expect(empty.transactions.replace(/^\uFEFF/, "").trim().split("\n")).toEqual([TRANSACTION_COLUMNS.join(",")]);
    expect(empty.dividends.replace(/^\uFEFF/, "").trim().split("\n")).toEqual([DIVIDEND_COLUMNS.join(",")]);
    expect(empty.readme).toContain(ACCOUNTANT_PACK_LABEL);
    expect(empty.readme).toContain("only its header row");
    expect(resolved.range).toMatchObject({ endingYear: 2027, asOf: "2026-11-23", from: "2026-04-01", to: "2027-03-31" });
  });

  it("defaults a closed tax year to 31 March and rejects a bad date", () => {
    const closed = resolveAccountantRange({ year: "2026" }, "2026-11-23");
    if (!closed.ok) throw new Error(closed.error);
    expect(closed.range).toMatchObject({ endingYear: 2026, asOf: "2026-03-31", from: "2025-04-01", to: "2026-03-31", taxYearLabel: "1 Apr 2025 to 31 Mar 2026" });
    expect(resolveAccountantRange({ asOf: "2026-02-31" }, "2026-11-23").ok).toBe(false);
    expect(resolveAccountantRange({ from: "2026-05-02", to: "2026-05-01" }, "2026-11-23").ok).toBe(false);
    expect(resolveAccountantRange({ year: "1999" }, "2026-11-23").ok).toBe(false);
  });

  it("keeps a row with no owner and drops another account", () => {
    expect(rowsOwnedBy([{ user: "user-a", ticker: "A" }, { user: { _id: "user-b" }, ticker: "B" }, { ticker: "C" }], "user-a").map((row) => row.ticker)).toEqual(["A", "C"]);
  });

  it("shows the download to a paid member, a lock to Free, and a sign-in link otherwise", () => {
    const paid = renderToStaticMarkup(createElement(TaxPageContent, { xero: "paid" }));
    expect(paid).toContain("Export for my accountant");
    expect(paid).toContain('action="/api/tax/accountant/export"');
    expect(paid).toContain('name="asOf"');
    expect(paid).toContain('name="from"');
    expect(paid).toContain('name="to"');
    expect(paid).toContain(ACCOUNTANT_PACK_LABEL);
    const free = renderToStaticMarkup(createElement(TaxPageContent, { xero: "free" }));
    expect(free).toContain("CSV export: Starter and above");
    expect(free).toContain("Export for my accountant");
    expect(free).not.toContain('action="/api/tax/accountant/export"');
    const guest = renderToStaticMarkup(createElement(TaxPageContent, { xero: "guest" }));
    expect(guest).toContain('href="/login?redirect=/tax"');
    expect(guest).toContain("Sign in to export");
    expect(guest).not.toContain('action="/api/tax/accountant/export"');
  });

  it("puts the download on the tax export area", () => {
    const page = readFileSync("src/components/tax/TaxPageContent.tsx", "utf8");
    expect(page).toContain("Export for my accountant");
    expect(page).toContain('action="/api/tax/accountant/export"');
    expect(page).toContain("ACCOUNTANT_PACK_LABEL");
    expect(page).toContain("Sharing this pack with your accountant from AetherForge is future work.");
    const route = readFileSync("src/app/api/tax/accountant/export/route.ts", "utf8");
    const loader = readFileSync("src/lib/accountant-export.server.ts", "utf8");
    expect(route).toContain("getStableSessionUser");
    expect(route).toContain("requestClaimsOtherUser");
    expect(route).toContain("canExportCsv");
    expect(route.indexOf("if (!canExportCsv")).toBeGreaterThan(route.indexOf("requestClaimsOtherUser(req, user._id)"));
    expect(route.indexOf("if (!canExportCsv")).toBeLessThan(route.indexOf("loadAccountantLedger(user._id)"));
    expect(route).toContain("rowsOwnedBy");
    expect(route).not.toContain('searchParams.get("userId")');
    expect(`${route}\n${loader}`).not.toMatch(/editRecord|createRecord|deleteRecord|updateRecord/);
  });

  it("escapes a formula in a name the member typed", () => {
    const resolved = resolveAccountantRange({ asOf: "2026-05-01", from: "2026-04-01", to: "2026-05-02" }, "2026-11-23");
    if (!resolved.ok) throw new Error(resolved.error);
    const built = buildAccountantPack({
      rows: [{ _id: "formula", type: "buy", ticker: "FPH.NZ", asset_name: '=HYPERLINK("http://evil")', quantity: 1, price: 2, currency: "NZD", fx_rate: 1, trade_date: "2026-04-02", executed_at: "2026-04-02" }],
      range: resolved.range,
      generatedAt: GENERATED,
    });
    expect(built.holdings).toContain(`'=HYPERLINK(""http://evil"")`);
    expect(built.holdings).not.toMatch(/(^|,)=HYPERLINK/);
  });

  it("keeps 31 March and 1 April on the Auckland day, not the UTC date", () => {
    const resolved = resolveAccountantRange({ asOf: "2027-03-31", from: "2026-04-01", to: "2027-03-31" }, "2026-11-23");
    if (!resolved.ok) throw new Error(resolved.error);
    const built = buildAccountantPack({
      rows: [
        { _id: "mar31", type: "buy", ticker: "MAR.NZ", quantity: 1, price: 1, currency: "NZD", fx_rate: 1, executed_at: "2026-03-31T10:00:00.000Z" },
        { _id: "apr1", type: "buy", ticker: "APR.NZ", quantity: 1, price: 1, currency: "NZD", fx_rate: 1, executed_at: "2026-03-31T23:00:00.000Z" },
        { _id: "end-in", type: "buy", ticker: "END.NZ", quantity: 1, price: 1, currency: "NZD", fx_rate: 1, executed_at: "2027-03-31T10:00:00.000Z" },
        { _id: "end-out", type: "buy", ticker: "OUT.NZ", quantity: 1, price: 1, currency: "NZD", fx_rate: 1, executed_at: "2027-03-31T23:00:00.000Z" },
      ],
      range: resolved.range,
      generatedAt: GENERATED,
    });
    const days = built.transactions
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\n")
      .slice(1)
      .map((row) => row.split(",")[0] + " " + row.split(",").at(-1));
    expect(days).toEqual(["2026-04-01 apr1", "2027-03-31 end-in"]);
    expect(built.transactions).not.toContain("mar31");
    expect(built.transactions).not.toContain("end-out");
  });

  it("names every tax year when the dates cross 31 March", () => {
    const span = resolveAccountantRange({ from: "2025-04-01", to: "2027-03-31", asOf: "2027-03-31" }, "2026-11-23");
    if (!span.ok) throw new Error(span.error);
    expect(span.range.taxYearLabel).toBe("1 Apr 2025 to 31 Mar 2026; 1 Apr 2026 to 31 Mar 2027");
    const edge = resolveAccountantRange({ from: "2026-03-31", to: "2026-04-01", asOf: "2026-04-01" }, "2026-11-23");
    if (!edge.ok) throw new Error(edge.error);
    expect(edge.range.taxYearLabel).toBe("1 Apr 2025 to 31 Mar 2026; 1 Apr 2026 to 31 Mar 2027");
  });

  it("sorts by date then id and records a truncation past 5,000 rows", () => {
    const rows: AccountantLedgerRow[] = [
      { _id: "b", type: "fee", trade_date: "2026-02-01", executed_at: "2026-02-01" },
      { _id: "a", type: "fee", trade_date: "2026-02-01", executed_at: "2026-02-01" },
      { _id: "c", type: "fee", trade_date: "2026-01-01", executed_at: "2026-01-01" },
    ];
    const picked = selectAccountantRows(rows, 2);
    expect(picked.truncated).toBe(true);
    expect(picked.read).toBe(3);
    expect(picked.kept).toBe(2);
    expect(picked.rows.map((row) => row._id)).toEqual(["c", "a"]);
    const resolved = resolveAccountantRange({ asOf: "2026-06-30", from: "2026-01-01", to: "2026-06-30" }, "2026-11-23");
    if (!resolved.ok) throw new Error(resolved.error);
    const built = buildAccountantPack({ rows: picked.rows, range: resolved.range, generatedAt: GENERATED, truncation: { read: picked.read, kept: picked.kept } });
    expect(built.readme).toContain("Truncated: 3 rows were read and 2 are included, chosen by date then id.");
  });

  it("writes a stored zip whose CSV payloads start with a UTF-8 BOM and whose clock is New Zealand time", () => {
    const resolved = resolveAccountantRange({}, "2026-11-23");
    if (!resolved.ok) throw new Error(resolved.error);
    const built = buildAccountantPack({ rows: [], range: resolved.range, generatedAt: GENERATED });
    const when = new Date(GENERATED);
    const zip = buildAccountantZip(built, when);
    const files = readStoredZip(zip);
    expect(files.map((file) => file.name)).toEqual(["holdings.csv", "transactions.csv", "dividends.csv", "README.txt"]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true });
    for (const file of files) {
      expect(file.method).toBe(0);
      expect(file.crc).toBe(crc32(file.data));
      expect(file.size).toBe(file.data.length);
      if (file.name.endsWith(".csv")) {
        expect(file.data[0]).toBe(0xef);
        expect(file.data[1]).toBe(0xbb);
        expect(file.data[2]).toBe(0xbf);
      }
    }
    expect(text.decode(files[3].data)).toBe(built.readme);
    expect(text.decode(files[0].data)).toBe(built.holdings);
    // 2026-11-23 06:00 UTC is 19:00 in New Zealand (NZDT, UTC+13). DOS time stores seconds in units of 2.
    expect(files[0].hour).toBe(19);
    expect(files[0].minute).toBe(0);
    expect(files[0].year).toBe(2026);
    expect(files[0].month).toBe(11);
    expect(files[0].day).toBe(23);
    expect(zipHasEocd(zip)).toBe(true);
  });
});

function readStoredZip(buf: Uint8Array): { name: string; data: Uint8Array; method: number; crc: number; size: number; hour: number; minute: number; year: number; month: number; day: number }[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: { name: string; data: Uint8Array; method: number; crc: number; size: number; hour: number; minute: number; year: number; month: number; day: number }[] = [];
  let offset = 0;
  while (offset + 30 <= buf.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const time = view.getUint16(offset + 10, true);
    const date = view.getUint16(offset + 12, true);
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(buf.slice(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    out.push({
      name,
      data: buf.slice(dataStart, dataStart + size),
      method,
      crc,
      size,
      hour: time >> 11,
      minute: (time >> 5) & 63,
      year: ((date >> 9) & 127) + 1980,
      month: (date >> 5) & 15,
      day: date & 31,
    });
    offset = dataStart + size;
  }
  return out;
}

function zipHasEocd(buf: Uint8Array): boolean {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let locals = 0;
  let centrals = 0;
  for (let i = 0; i + 4 <= buf.length; i += 1) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) locals += 1;
    if (sig === 0x02014b50) centrals += 1;
    if (sig === 0x06054b50) return locals === 4 && centrals === 4 && view.getUint16(i + 10, true) === 4;
  }
  return false;
}
