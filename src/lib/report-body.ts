/**
 * A saved report is listed only when it has a body.
 * An illustrated path contributes that body from its own numbers.
 * A placeholder title is not a report.
 */

import { illustratedPathFromPayloads, type IllustratedPathRecord } from "@/lib/book-log";
import { formatDisplayDate, formatNzd } from "@/lib/currency";

const PLACEHOLDER = "headmaster illustrated path";

export function reportBodyIsEmpty(text: string | null | undefined): boolean {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase() === PLACEHOLDER;
}

/** Real sentences from a stored path. Null when the path has no numbers. */
export function illustratedPathReportText(path: IllustratedPathRecord): string | null {
  if (!Number.isFinite(path.illustrated7dPct)) return null;
  if (!(Number(path.netWorthNZD) > 0)) return null;
  if (!Number.isFinite(path.issuedAtMs)) return null;
  const when = formatDisplayDate(new Date(path.issuedAtMs));
  if (when === "—") return null;
  const pct = Math.round(path.illustrated7dPct * 100) / 100;
  const sign = pct > 0 ? "+" : "";
  return `Illustrated 7-day path ${sign}${pct.toFixed(2)}%. Net worth on ${when}: ${formatNzd(path.netWorthNZD)}.`;
}

export function listedReportBody(input: {
  executiveSummary?: string | null;
  textBody?: string | null;
  payload?: unknown;
}): string | null {
  for (const candidate of [input.textBody, input.executiveSummary]) {
    if (candidate && !reportBodyIsEmpty(candidate)) return String(candidate).trim();
  }
  const path = illustratedPathFromPayloads([input.payload]);
  return path ? illustratedPathReportText(path) : null;
}

/** Onboarding ticks a Stox or Koins run only. A Headmaster path row is not a run. */
export function isStoxOrKoinsRun(input: {
  bot?: string | null;
  executiveSummary?: string | null;
  textBody?: string | null;
  payload?: unknown;
}): boolean {
  if (input.bot !== "stock" && input.bot !== "crypto") return false;
  return listedReportBody(input) != null;
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** One-page PDF of the report text already on screen. No extra figures. */
export function plainReportPdf(title: string, lines: readonly string[]): string {
  const rows = [title, ...lines].map((line) => line.replace(/[^\x20-\x7E]/g, " ").slice(0, 110)).slice(0, 40);
  const commands = ["BT", "/F1 11 Tf", "48 760 Td"];
  rows.forEach((line, index) => {
    if (index > 0) commands.push("0 -16 Td");
    commands.push(`(${pdfEscape(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return body;
}
