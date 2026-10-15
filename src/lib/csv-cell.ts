/**
 * H-10: CSV cell with formula-injection protection. A text cell that starts
 * with = + - @ tab or CR gets a leading apostrophe so a spreadsheet shows it
 * as text. Plain numbers (including negatives like -5.00) are left alone.
 */
export function csvEscape(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d[\d,]*(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
