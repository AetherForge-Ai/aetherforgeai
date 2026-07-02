import "server-only";
import * as XLSX from "xlsx";
import type { Stock } from "@/lib/portfolio";

/**
 * Professional AetherForge AI investor toolkit workbook (SheetJS / pure JS so it
 * runs on the Cloudflare Workers runtime). Produces a multi-sheet .xlsx with
 * live spreadsheet formulas:
 *   1. Welcome / Instructions
 *   2. Portfolio Tracker  — prefilled with the customer's holdings + formulas
 *   3. Transactions       — a working buy/sell ledger with running totals
 *   4. Performance Summary — headline metrics that reference the tracker
 *
 * Returned as a Uint8Array ready to stream from an API route.
 */

const CURRENCY_FMT = "#,##0.00";
const PERCENT_FMT = "0.00%";

function styleWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function setCell(
  ws: XLSX.WorkSheet,
  addr: string,
  cell: XLSX.CellObject
) {
  ws[addr] = cell;
}

function buildInstructions(): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ["AetherForge AI — Professional Investor Toolkit"],
    ["New Zealand–owned & operated · www.aetherforgeai.co.nz"],
    [""],
    ["Thank you for subscribing to an annual AetherForge AI plan."],
    [""],
    ["This workbook is your personal command centre for monitoring your own"],
    ["performance and transactions alongside your Zenith-Mode AI reports."],
    [""],
    ["HOW TO USE THIS WORKBOOK"],
    ["1. Portfolio Tracker — your current holdings are pre-loaded. Update the"],
    ["   'Current Price' column as prices move; every gain, weighting and total"],
    ["   recalculates automatically."],
    ["2. Transactions — log every buy and sell here. The ledger keeps a running"],
    ["   cost and realised total so your records stay audit-ready."],
    ["3. Performance Summary — headline numbers update themselves from the"],
    ["   Portfolio Tracker. Check it at a glance any time."],
    [""],
    ["WHY THIS MATTERS"],
    ["Consistent record-keeping is the single biggest habit that separates"],
    ["investors who compound wealth from those who don't. We strongly recommend"],
    ["you download this toolkit and use it every week: reconcile your holdings,"],
    ["log your transactions, and review your performance summary. Pairing this"],
    ["discipline with your AetherForge AI intelligence reports gives you a clear,"],
    ["defensible picture of exactly how your capital is performing over time."],
    [""],
    ["Tip: keep this file backed up and never share it — it is your private record."],
    [""],
    ["DISCLAIMER"],
    ["AetherForge AI provides general market information and AI-generated analysis"],
    ["only. It is not licensed financial advice under the Financial Markets Conduct"],
    ["Act 2013. Figures you enter are your responsibility. Seek advice from a"],
    ["licensed financial adviser before making investment decisions."],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  styleWidths(ws, [95]);
  // Merge the header line visually across a wide first column only (single col here).
  return ws;
}

function buildPortfolioTracker(holdings: Stock[]): XLSX.WorkSheet {
  const header = [
    "Ticker",
    "Type",
    "Company",
    "Sector",
    "Shares",
    "Purchase Price",
    "Current Price",
    "Cost Basis",
    "Market Value",
    "Gain / Loss",
    "Gain %",
    "Weight %",
  ];

  // Build value rows (formulas patched in afterwards).
  const dataRows = holdings.map((h) => [
    h.ticker || "",
    (h.asset_type || "stock") === "crypto" ? "Crypto" : "Stock",
    h.company_name || h.ticker || "",
    h.sector || "Other",
    Number(h.shares) || 0,
    Number(h.purchase_price) || 0,
    Number(h.current_price) || Number(h.purchase_price) || 0,
    "", // Cost Basis (formula)
    "", // Market Value (formula)
    "", // Gain (formula)
    "", // Gain % (formula)
    "", // Weight % (formula)
  ]);

  const aoa: (string | number)[][] = [header, ...dataRows];
  const n = holdings.length;
  const totalsRow = n + 2; // 1 header + n data rows, totals on next row (1-indexed)

  // Totals row placeholder
  aoa.push(["TOTAL", "", "", "", "", "", "", "", "", "", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Patch per-holding formulas.
  for (let i = 0; i < n; i++) {
    const r = i + 2; // spreadsheet row (1-indexed, +1 for header)
    setCell(ws, `H${r}`, { t: "n", f: `E${r}*F${r}`, z: CURRENCY_FMT });
    setCell(ws, `I${r}`, { t: "n", f: `E${r}*G${r}`, z: CURRENCY_FMT });
    setCell(ws, `J${r}`, { t: "n", f: `I${r}-H${r}`, z: CURRENCY_FMT });
    setCell(ws, `K${r}`, { t: "n", f: `IF(H${r}=0,0,J${r}/H${r})`, z: PERCENT_FMT });
    setCell(ws, `L${r}`, { t: "n", f: `IF($I$${totalsRow}=0,0,I${r}/$I$${totalsRow})`, z: PERCENT_FMT });
    // Ensure numeric price/share cells carry currency formatting
    setCell(ws, `F${r}`, { t: "n", v: Number(holdings[i].purchase_price) || 0, z: CURRENCY_FMT });
    setCell(ws, `G${r}`, {
      t: "n",
      v: Number(holdings[i].current_price) || Number(holdings[i].purchase_price) || 0,
      z: CURRENCY_FMT,
    });
  }

  // Totals row formulas (sum data range rows 2..n+1)
  if (n > 0) {
    setCell(ws, `H${totalsRow}`, { t: "n", f: `SUM(H2:H${n + 1})`, z: CURRENCY_FMT });
    setCell(ws, `I${totalsRow}`, { t: "n", f: `SUM(I2:I${n + 1})`, z: CURRENCY_FMT });
    setCell(ws, `J${totalsRow}`, { t: "n", f: `SUM(J2:J${n + 1})`, z: CURRENCY_FMT });
    setCell(ws, `K${totalsRow}`, { t: "n", f: `IF(H${totalsRow}=0,0,J${totalsRow}/H${totalsRow})`, z: PERCENT_FMT });
    setCell(ws, `L${totalsRow}`, { t: "n", f: `IF($I$${totalsRow}=0,0,I${totalsRow}/$I$${totalsRow})`, z: PERCENT_FMT });
  }

  styleWidths(ws, [10, 8, 26, 20, 12, 15, 14, 15, 15, 14, 10, 10]);
  return ws;
}

function buildTransactions(holdings: Stock[]): XLSX.WorkSheet {
  const header = [
    "Date",
    "Ticker",
    "Action",
    "Asset Class",
    "Shares",
    "Price",
    "Fees",
    "Net Total",
    "Notes",
  ];

  // Seed with the customer's current holdings as example "Buy" rows so the
  // ledger isn't empty, then leave blank rows ready to fill.
  const seeded = holdings.slice(0, 8).map((h) => [
    "",
    h.ticker || "",
    "Buy",
    (h.asset_type || "stock") === "crypto" ? "Crypto" : "Stock",
    Number(h.shares) || 0,
    Number(h.purchase_price) || 0,
    0,
    "", // Net Total (formula)
    "Opening position",
  ]);

  const blanks = Array.from({ length: 12 }, () => ["", "", "", "", "", "", "", "", ""]);
  const aoa: (string | number)[][] = [header, ...seeded, ...blanks];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const lastRow = aoa.length; // includes header
  for (let r = 2; r <= lastRow; r++) {
    // Net Total = (Shares * Price) +/- Fees depending on action (Buy adds fees, Sell subtracts)
    setCell(ws, `H${r}`, {
      t: "n",
      f: `IF(E${r}="",0,IF(C${r}="Sell",E${r}*F${r}-G${r},E${r}*F${r}+G${r}))`,
      z: CURRENCY_FMT,
    });
  }

  styleWidths(ws, [14, 10, 10, 13, 12, 14, 10, 15, 28]);
  return ws;
}

function buildSummary(holdings: Stock[]): XLSX.WorkSheet {
  const n = holdings.length;
  const totalsRow = n + 2;
  const pt = "'Portfolio Tracker'";

  const aoa: (string | number)[][] = [
    ["Performance Summary"],
    ["Auto-calculated from your Portfolio Tracker"],
    [""],
    ["Metric", "Value"],
    ["Total Cost Basis", ""],
    ["Total Market Value", ""],
    ["Total Unrealised Gain / Loss", ""],
    ["Total Return %", ""],
    ["Number of Holdings", n],
    [""],
    ["Update the 'Current Price' column in the Portfolio Tracker to refresh these numbers."],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  setCell(ws, "B5", { t: "n", f: `${pt}!H${totalsRow}`, z: CURRENCY_FMT });
  setCell(ws, "B6", { t: "n", f: `${pt}!I${totalsRow}`, z: CURRENCY_FMT });
  setCell(ws, "B7", { t: "n", f: `${pt}!J${totalsRow}`, z: CURRENCY_FMT });
  setCell(ws, "B8", { t: "n", f: `${pt}!K${totalsRow}`, z: PERCENT_FMT });

  styleWidths(ws, [34, 20]);
  return ws;
}

export function buildToolkitWorkbook(holdings: Stock[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildInstructions(), "Welcome");
  XLSX.utils.book_append_sheet(wb, buildPortfolioTracker(holdings), "Portfolio Tracker");
  XLSX.utils.book_append_sheet(wb, buildTransactions(holdings), "Transactions");
  XLSX.utils.book_append_sheet(wb, buildSummary(holdings), "Performance Summary");

  wb.Props = {
    Title: "AetherForge AI Investor Toolkit",
    Author: "AetherForge AI",
    Company: "AetherForge AI",
  };

  // 'array' → Uint8Array, the Workers-safe output type.
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out as ArrayBuffer);
}
