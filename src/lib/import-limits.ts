/** H-10: one size cap for broker files, checked in the browser and on the server. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_TOO_LARGE = "That file is larger than 5 MB. Split it into smaller files and import each one. Nothing was written.";
export const IMPORT_BAD_TYPE = "That file is not a CSV, text or .xlsx file. Export a CSV or .xlsx from your broker and try again.";

const ALLOWED_TYPES = new Set(["", "text/csv", "text/plain", "application/vnd.ms-excel", "application/csv", "text/x-csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

/** Browser-side check before reading a file. Returns an error message or null. */
export function importFileProblem(file: { size: number; type?: string; name?: string }): string | null {
  if (file.size > IMPORT_MAX_BYTES) return IMPORT_TOO_LARGE;
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  // BS-02: .xlsx is read as values only (no macros, no formulas). .xlsm/.xls and other types are refused.
  if (/\.(xlsm|xls|xlsb)$/.test(name)) return IMPORT_BAD_TYPE;
  if (!ALLOWED_TYPES.has(type) && !/\.(csv|txt|xlsx)$/.test(name)) return IMPORT_BAD_TYPE;
  return null;
}

/** UTF-8 byte length of the text sent to the server. */
export function importTextTooLarge(text: string): boolean {
  if (text.length > IMPORT_MAX_BYTES) return true;
  return new TextEncoder().encode(text).length > IMPORT_MAX_BYTES;
}
