/**
 * Spreadsheet → CSV for the H-10 import framework. Stake's Transaction Report is XLSX
 * with ASX and US trades on separate tabs; ASB and CommSec history can arrive as
 * spreadsheets too. Every sheet whose header row matches the first sheet's is joined
 * under one header, so the existing CSV detectors and parsers run unchanged.
 * Pure: takes the parsed workbook shape, so it is testable without the xlsx package.
 */
export interface SheetGrid {
  name: string;
  rows: unknown[][];
}

function cell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function headerKey(row: unknown[]): string {
  return row.map((v) => String(v ?? "").trim().toLowerCase()).join("|");
}

function firstRealRow(rows: unknown[][]): number {
  return rows.findIndex((r) => r.filter((v) => String(v ?? "").trim() !== "").length >= 3);
}

export function sheetsToCsv(sheets: SheetGrid[]): string {
  let header: unknown[] | null = null;
  const out: string[] = [];
  for (const sheet of sheets) {
    const start = firstRealRow(sheet.rows);
    if (start < 0) continue;
    const head = sheet.rows[start];
    if (!header) {
      header = head;
      out.push(head.map(cell).join(","));
    } else if (headerKey(head) !== headerKey(header)) {
      continue;
    }
    for (const row of sheet.rows.slice(start + 1)) {
      if (row.every((v) => String(v ?? "").trim() === "")) continue;
      out.push(header.map((_, i) => cell(row[i])).join(","));
    }
  }
  return out.join("\n");
}

export function isSpreadsheetName(name: string): boolean {
  return /\.(xlsx|xls)$/i.test(name);
}

/** Browser/server: read an XLSX ArrayBuffer with the xlsx package (loaded on demand). */
export async function workbookToCsv(data: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(data), { type: "array", cellDates: true });
  const sheets: SheetGrid[] = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" }),
  }));
  return sheetsToCsv(sheets);
}
