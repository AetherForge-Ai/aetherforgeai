// Generates the EXAMPLE DATA InvestNow fixtures. Synthetic numbers; real layout unverified.
const XLSX = require("xlsx");
const title = [["InvestNow - General Ledger Report - EXAMPLE DATA (synthetic; real-layout unverified)"], ["Period: 01 Apr 2025 to 31 Mar 2026"], []];
const header = ["Transaction Date", "Fund / Security Code", "Description", "Units", "Unit Price", "Fees", "Currency", "FX Rate (NZD per unit)", "Amount (NZD)"];
const good = [
  ["2025-05-02", "FNZ.NZ", "Buy", 100, 6.25, 0, "NZD", 1, -625.0],
  ["2025-06-10", "AAPL", "Buy", 10, 200.0, 0, "USD", 1.7, -3400.0],
  ["2025-08-15", "FNZ.NZ", "Sell", 40, 6.5, 0, "NZD", 1, 260.0],
  ["2025-09-01", "USF.NZ", "Buy", 50, 2.1, 0, "NZD", 1, -105.0],
];
const bad = [
  ["not-a-date", "FNZ.NZ", "Buy", 5, 6.3, 0, "NZD", 1, -31.5],
  ["2025-10-01", "USF.NZ", "Buy", "abc", 2.2, 0, "NZD", 1, -11.0],
  ["2025-10-02", "", "Buy", 3, 6.4, 0, "NZD", 1, -19.2],
];
function write(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet([...title, header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "General Ledger");
  XLSX.writeFile(wb, `${name}.xlsx`);
  // "Save as CSV" from the workbook keeps the title rows, as Excel does.
  require("fs").writeFileSync(`${name}.csv`, XLSX.utils.sheet_to_csv(ws, { blankrows: true }) + "\n");
}
write("investnow-example", good);
write("investnow-example-bad-rows", [...good, ...bad]);
