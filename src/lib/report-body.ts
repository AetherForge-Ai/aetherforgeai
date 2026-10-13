/**
 * A saved report is listed only when it has a body.
 * An illustrated path contributes that body from its own numbers.
 * A placeholder title is not a report.
 */

import { type IllustratedPathRecord } from "@/lib/book-log";
import { formatDisplayDate, formatNzd } from "@/lib/currency";
import { planningAssumptionPct } from "@/lib/totalum-engine";

const PLACEHOLDER = "headmaster illustrated path";
const CRYPTO_PAUSE = "Crypto projections are paused; the crypto sleeve uses the planning assumption only.";

export function reportBodyIsEmpty(text: string | null | undefined): boolean {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase() === PLACEHOLDER;
}

function isIllustratedPathSentence(text: string): boolean {
  return text.replace(/\s+/g, " ").trim().toLowerCase().startsWith("illustrated 7-day path");
}

export interface HeadmasterHoldingLine {
  label: string;
  valueNZD: number;
}

export interface HeadmasterAllocationLine {
  label: string;
  weightPct: number;
  valueNZD: number;
}

export interface HeadmasterTradeLine {
  whenLabel: string;
  type: string;
  ticker: string;
  amountNZD: number | null;
}

/** Facts stored with a Headmaster report. Null means that section was not on the payload. */
export interface HeadmasterBookBrief {
  holdsCrypto?: boolean;
  holdings: HeadmasterHoldingLine[] | null;
  allocation: HeadmasterAllocationLine[] | null;
  cashNZD: number | null;
  trades: HeadmasterTradeLine[] | null;
  /** Used when trades is null. */
  tradesReason?: string;
  risks: string[] | null;
}

const MISSING = {
  holdings: "Holding lines were not stored with this report.",
  allocation: "Allocation was not stored with this report.",
  cash: "Cash was not stored with this report.",
  trades: "The ledger was not stored with this report.",
  risks: "Risk notes were not stored with this report.",
};

function dash(reason: string): string {
  return `— ${reason}`;
}

function moneyLine(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  return formatNzd(value);
}

/** Real sentences from a stored path. Null when the path has no numbers. */
export function illustratedPathReportText(
  path: IllustratedPathRecord,
  options?: { holdsCrypto?: boolean }
): string | null {
  if (!Number.isFinite(path.illustrated7dPct)) return null;
  if (!(Number(path.netWorthNZD) > 0)) return null;
  if (!Number.isFinite(path.issuedAtMs)) return null;
  const when = formatDisplayDate(new Date(path.issuedAtMs));
  if (when === "—") return null;
  const pct = Math.round(path.illustrated7dPct * 100) / 100;
  const sign = pct > 0 ? "+" : "";
  const equities = planningAssumptionPct("equities");
  const crypto = planningAssumptionPct("crypto");
  const metals = planningAssumptionPct("metals");
  const sentence = `Illustrated 7-day path ${sign}${pct.toFixed(2)}% from fixed long-run planning assumptions (equities ${equities}%, crypto ${crypto}%, metals ${metals}% a year), not a forecast. Issued ${when}. Net worth then ${formatNzd(path.netWorthNZD)}.`;
  return options?.holdsCrypto ? `${sentence} ${CRYPTO_PAUSE}` : sentence;
}

/**
 * Headmaster report body: holdings, allocation, cash, recent trades, risks, and the labelled path.
 * A missing section is an em dash and a reason. Nothing here is filled in from a guess.
 */
export function headmasterReportText(input: {
  path: IllustratedPathRecord;
  brief: HeadmasterBookBrief;
}): string | null {
  const pathLine = illustratedPathReportText(input.path, { holdsCrypto: input.brief.holdsCrypto === true });
  if (!pathLine) return null;
  const lines: string[] = [];

  lines.push("Holdings");
  if (input.brief.holdings == null) lines.push(dash(MISSING.holdings));
  else if (!input.brief.holdings.length) lines.push(dash("No shares, crypto, or metals are on this book."));
  else {
    for (const row of input.brief.holdings) {
      const value = moneyLine(row.valueNZD);
      lines.push(value ? `${row.label} ${value}` : `${row.label} ${dash("Value was not stored for this holding.")}`);
    }
  }

  lines.push("Allocation");
  if (input.brief.allocation == null) lines.push(dash(MISSING.allocation));
  else if (!input.brief.allocation.length) lines.push(dash("No allocation was calculated for this book."));
  else {
    for (const row of input.brief.allocation) {
      const value = moneyLine(row.valueNZD);
      const weight = Number.isFinite(row.weightPct) ? `${row.weightPct.toFixed(1)}%` : dash("Weight was not stored.");
      lines.push(value ? `${row.label} ${weight} ${value}` : `${row.label} ${weight} ${dash("Value was not stored.")}`);
    }
  }

  lines.push("Cash");
  if (input.brief.cashNZD == null || !Number.isFinite(input.brief.cashNZD)) lines.push(dash(MISSING.cash));
  else lines.push(formatNzd(input.brief.cashNZD));

  lines.push("Recent trades");
  if (input.brief.trades == null) lines.push(dash(input.brief.tradesReason || MISSING.trades));
  else if (!input.brief.trades.length) lines.push(dash("No trades are stored on this book."));
  else {
    for (const trade of input.brief.trades) {
      const amount = trade.amountNZD != null && Number.isFinite(trade.amountNZD) ? formatNzd(trade.amountNZD) : dash("Amount was not stored.");
      const name = trade.ticker ? ` ${trade.ticker}` : "";
      lines.push(`${trade.whenLabel} ${trade.type}${name} ${amount}`.replace(/\s+/g, " ").trim());
    }
  }

  lines.push("Risks");
  if (input.brief.risks == null) lines.push(dash(MISSING.risks));
  else if (!input.brief.risks.length) lines.push(dash("No concentration risk was scored for this book."));
  else {
    for (const risk of input.brief.risks) lines.push(risk);
  }

  lines.push(pathLine);
  return lines.join("\n");
}

export function bookBriefFromSynthesis(
  synthesis: {
    positions: { label: string; assetClass: string; valueNZD: number }[];
    classAllocation: { label: string; weight: number; valueNZD: number }[];
    cashBalanceNZD: number;
    concentrationRisks: { note: string }[];
  },
  trades: HeadmasterTradeLine[] | null,
  holdsCrypto: boolean
): HeadmasterBookBrief {
  const holdings = synthesis.positions
    .filter((row) => row.assetClass !== "cash" && row.label)
    .map((row) => ({ label: row.label, valueNZD: Number(row.valueNZD) }));
  const allocation = synthesis.classAllocation
    .filter((row) => row.label)
    .map((row) => ({ label: row.label, weightPct: Number(row.weight), valueNZD: Number(row.valueNZD) }));
  const risks = synthesis.concentrationRisks.map((row) => String(row.note || "").trim()).filter(Boolean);
  const cash = Number(synthesis.cashBalanceNZD);
  return {
    holdsCrypto,
    holdings,
    allocation,
    cashNZD: Number.isFinite(cash) ? cash : null,
    trades,
    risks,
  };
}

function pathFromPayload(payload: unknown): { path: IllustratedPathRecord; holdsCrypto: boolean } | null {
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const path = (parsed as { illustratedPath?: unknown }).illustratedPath;
  if (!path || typeof path !== "object") return null;
  const row = path as IllustratedPathRecord & { holdsCrypto?: unknown; cryptoNZD?: unknown };
  if (!Number.isFinite(row.illustrated7dPct)) return null;
  if (!(Number(row.netWorthNZD) > 0)) return null;
  if (!Number.isFinite(row.issuedAtMs)) return null;
  return {
    path: {
      illustrated7dPct: Number(row.illustrated7dPct),
      netWorthNZD: Number(row.netWorthNZD),
      issuedAtMs: Number(row.issuedAtMs),
    },
    holdsCrypto: row.holdsCrypto === true || Number(row.cryptoNZD) > 0,
  };
}

function parsedPayload(payload: unknown): Record<string, unknown> | null {
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as Record<string, unknown>;
}

function briefFromPayload(payload: unknown, holdsCrypto: boolean): HeadmasterBookBrief | null {
  const parsed = parsedPayload(payload);
  const brief = parsed?.bookBrief;
  if (!brief || typeof brief !== "object") return null;
  const row = brief as Partial<HeadmasterBookBrief>;
  return {
    holdsCrypto: row.holdsCrypto === true || holdsCrypto,
    holdings: Array.isArray(row.holdings) ? row.holdings : null,
    allocation: Array.isArray(row.allocation) ? row.allocation : null,
    cashNZD: row.cashNZD == null ? null : Number(row.cashNZD),
    trades: Array.isArray(row.trades) ? row.trades : null,
    risks: Array.isArray(row.risks) ? row.risks.filter((item) => typeof item === "string") : null,
  };
}

export function listedReportBody(input: {
  executiveSummary?: string | null;
  textBody?: string | null;
  payload?: unknown;
}): string | null {
  const stored = [input.textBody, input.executiveSummary].find((candidate) => candidate && !reportBodyIsEmpty(candidate));
  const fromPayload = pathFromPayload(input.payload);
  const brief = fromPayload ? briefFromPayload(input.payload, fromPayload.holdsCrypto) : null;
  if (fromPayload && brief) return headmasterReportText({ path: fromPayload.path, brief });
  if (fromPayload && (!stored || isIllustratedPathSentence(String(stored)))) {
    return headmasterReportText({
      path: fromPayload.path,
      brief: {
        holdsCrypto: fromPayload.holdsCrypto,
        holdings: null,
        allocation: null,
        cashNZD: null,
        trades: null,
        risks: null,
      },
    });
  }
  return stored ? String(stored).trim() : null;
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

function wrapPdfLine(line: string): string[] {
  const clean = line.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const width = 96;
  if (clean.length <= width) return [clean];
  const rows: string[] = [];
  let current = "";
  for (const word of clean.split(" ")) {
    const piece = word.length > width ? word.slice(0, width) : word;
    const next = current ? `${current} ${piece}` : piece;
    if (current && next.length > width) {
      rows.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) rows.push(current);
  return rows;
}

/** One-page PDF of the report text already on screen. No extra figures. */
export function plainReportPdf(title: string, lines: readonly string[]): string {
  const rows: string[] = [];
  for (const line of [title, ...lines]) {
    rows.push(...wrapPdfLine(line));
    if (rows.length >= 40) break;
  }
  const fitted = rows.slice(0, 40);
  const commands = ["BT", "/F1 11 Tf", "48 760 Td"];
  fitted.forEach((line, index) => {
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
