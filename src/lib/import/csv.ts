/** RFC 4180 reader. A quoted cell may contain a comma or a line break. */

export function parseCsv(text: string): string[][] {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quote = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quote = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quote = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((part) => part.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((part) => part.length > 0)) rows.push(row);
  }
  return rows;
}

export function normHeader(value: string): string {
  return value
    .replace(/\uFEFF/g, "")
    .replace(/[\u201C\u201D\u2018\u2019]/g, "")
    .replace(/["']/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function headerIndex(headers: readonly string[], names: readonly string[]): number {
  const wanted = new Set(names.map(normHeader));
  return headers.findIndex((header) => wanted.has(normHeader(header)));
}

export function cell(row: readonly string[], index: number): string {
  if (index < 0) return "";
  return row[index] ?? "";
}
