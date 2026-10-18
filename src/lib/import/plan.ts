import { parseCsv } from "@/lib/import/csv";
import { BROKER_LABEL, detectBroker, mappingReady } from "@/lib/import/formats";
import { contentHash } from "@/lib/import/hash";
import { IMPORT_TOO_LARGE, textTooLarge } from "@/lib/import/limits";
import { parseAsb } from "@/lib/import/parsers/asb";
import { parseCommsec } from "@/lib/import/parsers/commsec";
import { parseEasyCrypto } from "@/lib/import/parsers/easycrypto";
import { parseGeneric } from "@/lib/import/parsers/generic";
import { parseHatch } from "@/lib/import/parsers/hatch";
import { parseIbkr } from "@/lib/import/parsers/ibkr";
import { parseJarden } from "@/lib/import/parsers/jarden";
import { parseSharesies } from "@/lib/import/parsers/sharesies";
import { parseStake } from "@/lib/import/parsers/stake";
import { parseSwyftx } from "@/lib/import/parsers/swyftx";
import type { BrokerDraft } from "@/lib/import/draft";
import type { BrokerId, ImportPreview, ImportRow, PlanOptions, RowNote } from "@/lib/import/types";

const EMPTY: ImportPreview = {
  broker: null,
  label: "Column map",
  error: null,
  headers: [],
  needsMapping: false,
  unreadable: false,
  rows: [],
  toWrite: [],
  errors: [],
  skipped: [],
  fxNeeds: [],
  cashNzd: 0,
  fileHash: null,
};

function blank(partial: Partial<ImportPreview>): ImportPreview {
  return { ...EMPTY, ...partial };
}

function parseBroker(broker: BrokerId, grid: string[][], options: PlanOptions): BrokerDraft {
  const rates = options.reviewedRates;
  switch (broker) {
    case "sharesies":
      return parseSharesies(grid, rates);
    case "hatch":
      return parseHatch(grid, rates);
    case "ibkr":
      return parseIbkr(grid, rates);
    case "stake":
      return parseStake(grid, rates);
    case "asb":
      return parseAsb(grid, rates);
    case "jarden":
      return parseJarden(grid, rates);
    case "commsec":
      return parseCommsec(grid, rates);
    case "swyftx":
      return parseSwyftx(grid, rates);
    case "easycrypto":
      return parseEasyCrypto(grid, rates);
    case "generic":
      return parseGeneric(grid, options.mapping!, rates);
  }
}

function sumCash(rows: readonly ImportRow[]): number {
  const cents = rows.reduce((sum, row) => sum + Math.round(row.cashEffectNzd * 100), 0);
  return cents / 100;
}

/** Sells that the book cannot cover stay as row errors. Earlier buys in this file count. */
export function keepCovered(rows: readonly ImportRow[], held: Record<string, number> | undefined): { toWrite: ImportRow[]; errors: RowNote[] } {
  const running: Record<string, number> = { ...(held || {}) };
  const toWrite: ImportRow[] = [];
  const errors: RowNote[] = [];
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
  for (const row of ordered) {
    const have = running[row.ticker] || 0;
    if (row.side === "sell" && row.quantity - have > 1e-8) {
      errors.push({
        line: row.line,
        message: `Line ${row.line}: Sell of ${row.quantity} ${row.ticker} is more than the ${have} already held. This row was not saved.`,
      });
      continue;
    }
    running[row.ticker] = have + (row.side === "buy" ? row.quantity : -row.quantity);
    toWrite.push(row);
  }
  return { toWrite, errors };
}

/** Leading comment (# …) or empty rows, at most 5, are not the header. */
export function stripPreamble(grid: string[][]): string[][] {
  let i = 0;
  while (i < grid.length && i < 5 && (grid[i].every((c) => !c.trim()) || /^#/.test((grid[i][0] || "").trim()))) i += 1;
  return i ? grid.slice(i) : grid;
}

/**
 * Preview only. Nothing is written.
 * A file over 5 MB is refused before the CSV is read.
 * Good rows stay in `toWrite` when other rows have errors.
 */
export async function previewImport(text: string, options: PlanOptions = {}): Promise<ImportPreview> {
  if (textTooLarge(text || "")) {
    return blank({ error: IMPORT_TOO_LARGE, unreadable: true });
  }
  // b33 H-10 (GOAL-LOCK #7): a leading "# note" or blank row hid the header row, so known
  // layouts fell to "Match the columns". Skip that preamble (up to 5 rows) before detecting.
  const grid = stripPreamble(parseCsv(text || ""));
  if (grid.length < 2) {
    return blank({ error: "This file is not a CSV of trades. Nothing was written.", unreadable: true, headers: grid[0] || [] });
  }
  const detected = detectBroker(grid);
  const headers = grid[0] || [];
  if (!detected && !mappingReady(options.mapping)) {
    return blank({
      broker: null,
      label: "Column map",
      error: "Choose the date, ticker, side, quantity and price columns. Nothing was written.",
      headers,
      needsMapping: true,
    });
  }
  const broker: BrokerId = detected || "generic";
  const draft = parseBroker(broker, grid, options);
  const covered = keepCovered(draft.rows, options.held);
  const toWrite = covered.toWrite;
  const errors = [...draft.errors, ...covered.errors].sort((a, b) => a.line - b.line);
  const fileHash = await contentHash(text);
  return {
    broker,
    label: BROKER_LABEL[broker],
    error: toWrite.length ? null : errors[0]?.message || draft.skipped[0]?.message || "No buy or sell rows could be read. Nothing was written.",
    headers,
    needsMapping: false,
    unreadable: false,
    rows: draft.rows,
    toWrite,
    errors,
    skipped: draft.skipped,
    fxNeeds: draft.fxNeeds,
    cashNzd: sumCash(toWrite),
    fileHash,
  };
}
