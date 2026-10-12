/**
 * A DEX fill keeps its source. Coin-list crypto stays "Crypto".
 * Chain is the readable network name (Ethereum, Solana), not a pool address.
 *
 * Totalum has no venue or chain column. A holding stores `DEX · <Chain>` in
 * stock.sector. A ledger row stores `[DEX:<Chain>] ` at the start of notes.
 * The UI parses those and does not show the prefix as the note text.
 *
 * pull-check:qa-2026-10-10-medium-m1-m9
 */

import { stripDividendNotesPrefix } from "@/lib/dividend-ledger";

export interface DexSource {
  venue?: string | null;
  market?: string | null;
  chain?: string | null;
  sector?: string | null;
  notes?: string | null;
}

export function isDexSource(input: DexSource | null | undefined): boolean {
  if (!input) return false;
  if (input.venue === "DEX" || input.market === "DEX") return true;
  if (parseDexSector(input.sector)) return true;
  if (parseDexNotes(input.notes)) return true;
  return false;
}

/** "DEX · Ethereum", or "DEX" when the chain was not recorded. */
export function dexSourceLabel(input: DexSource | null | undefined): string | null {
  if (!isDexSource(input)) return null;
  const chain =
    cleanChain(input?.chain) || parseDexNotes(input?.notes)?.chain || parseDexSector(input?.sector)?.chain;
  return chain ? `DEX · ${chain}` : "DEX";
}

export function cleanChain(value: unknown): string | null {
  const chain = String(value || "")
    .replace(/[\[\]\r\n]/g, "")
    .trim();
  if (!chain || chain === "Unavailable" || chain === "—") return null;
  return chain.slice(0, 60);
}

/** Holding tag stored in the existing stock.sector field. */
export function dexSectorTag(chain?: string | null): string {
  const cleaned = cleanChain(chain);
  return cleaned ? `DEX · ${cleaned}` : "DEX";
}

export function parseDexSector(sector?: string | null): { venue: "DEX"; chain: string | null } | null {
  const match = String(sector || "").trim().match(/^DEX(?:\s*·\s*(.+))?$/);
  if (!match) return null;
  return { venue: "DEX", chain: cleanChain(match[1]) };
}

/** Ledger prefix stored at the start of the existing transaction.notes field. */
export function dexNotesPrefix(chain?: string | null): string {
  const cleaned = cleanChain(chain);
  return cleaned ? `[DEX:${cleaned}] ` : "[DEX] ";
}

export function parseDexNotes(
  notes?: string | null
): { venue: "DEX"; chain: string | null; note: string } | null {
  const raw = notes || "";
  const match = raw.match(/^\[DEX(?::([^\]]*))?\]\s*/);
  if (!match) return null;
  return { venue: "DEX", chain: cleanChain(match[1]), note: raw.slice(match[0].length) };
}

export function stripDexNotesPrefix(notes?: string | null): string {
  const parsed = parseDexNotes(notes);
  return parsed ? parsed.note : notes || "";
}

/** Machine stamp in the existing notes field. Spaces in the chain become underscores. */
export function withQuoteStamp(notes: string | null | undefined, chain: string | null, priceAsAt: string | null): string {
  const body = stripQuoteStamp(notes);
  const parts: string[] = [];
  const cleaned = (chain || "").trim();
  if (cleaned) parts.push(`chain=${cleaned.replace(/\s+/g, "_")}`);
  const at = (priceAsAt || "").trim();
  if (at) parts.push(`pxat=${at.replace(/\s+/g, "")}`);
  const stamp = parts.join(" ");
  if (!stamp) return body;
  const next = body ? `${body}\n${stamp}` : stamp;
  if (next.length <= 4000) return next;
  const room = Math.max(0, 4000 - stamp.length - 1);
  return `${body.slice(0, room).trimEnd()}\n${stamp}`.slice(0, 4000);
}

/** Stored trade notes stay inside the original notes limit. */
const TRADE_NOTE_MAX = 4000;

function takeStamp(text: string, re: RegExp): { token: string; rest: string } {
  const match = text.match(re);
  if (!match || match.index == null) return { token: "", rest: text };
  const token = (match[1] || match[0]).trim();
  const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  return { token, rest };
}

/**
 * Keep idem=, live=, chain=, pxat= and the FILLED source= audit sentence.
 * Only the user's free text is trimmed, and the whole note stays within 4000 characters.
 */
export function preserveQuoteStamp(notes: string | null | undefined, chain: string | null, priceAsAt: string | null): string {
  let raw = String(notes || "");
  const auditMatch = raw.match(/\[audit [^\]]*\][^\n]*FILLED[^\n]*source=\S+[^\n]*/i);
  const audit = auditMatch?.[0].trim() || "";
  if (auditMatch && auditMatch.index != null) {
    raw = `${raw.slice(0, auditMatch.index)} ${raw.slice(auditMatch.index + auditMatch[0].length)}`;
  }
  const idem = takeStamp(raw, /(?:^|\s)(idem=\S+)/);
  raw = idem.rest;
  const live = takeStamp(raw, /(?:^|\s)(live=n\/a|live=[0-9.]+)/i);
  raw = live.rest;
  const user = stripQuoteStamp(raw).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const stamps: string[] = [];
  const cleaned = (chain || "").trim();
  if (cleaned) stamps.push(`chain=${cleaned.replace(/\s+/g, "_")}`);
  const at = (priceAsAt || "").trim();
  if (at) stamps.push(`pxat=${at.replace(/\s+/g, "")}`);
  if (live.token) stamps.push(live.token);
  if (idem.token) stamps.push(idem.token);
  const protectedBlock = [...stamps, audit].filter(Boolean).join(" ").trim();
  if (!protectedBlock) return user.slice(0, TRADE_NOTE_MAX);
  const room = TRADE_NOTE_MAX - protectedBlock.length - 1;
  const trimmed = room > 0 ? user.slice(0, room).trimEnd() : "";
  const next = trimmed ? `${protectedBlock} ${trimmed}` : protectedBlock;
  return next.length <= TRADE_NOTE_MAX ? next : next.slice(0, TRADE_NOTE_MAX);
}

/**
 * Ledger table text. Stored notes keep live=, chain=, pxat=, and idem=.
 * The table shows the user's words only.
 */
export function displayLedgerNote(notes: string | null | undefined): string {
  return stripQuoteStamp(stripDexNotesPrefix(stripDividendNotesPrefix(String(notes || ""))))
    .replace(/\[audit[^\]]*\][^\n]*/gi, " ")
    .replace(/(^|\s)live=(?:n\/a|[0-9.]+)/gi, "$1")
    .replace(/(^|\s)idem=\S+/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripQuoteStamp(notes: string | null | undefined): string {
  return String(notes || "")
    .replace(/(^|\s)chain=\S+/g, "$1")
    .replace(/(^|\s)pxat=\S+/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chainFromNotes(notes: string | null | undefined): string | null {
  const match = String(notes || "").match(/(?:^|\s)chain=(\S+)/);
  if (!match) return null;
  const label = match[1].replace(/_/g, " ").trim();
  return label || null;
}

export function priceAsAtFromNotes(notes: string | null | undefined): string | null {
  const match = String(notes || "").match(/(?:^|\s)pxat=(\S+)/);
  return match?.[1] || null;
}

export function withDexNotes(notes: string | null | undefined, chain: string | null, isDex: boolean): string {
  const body = stripDexNotesPrefix(notes);
  if (!isDex) return body;
  const prefix = dexNotesPrefix(chain);
  return body ? `${prefix}${body}` : prefix.trimEnd();
}

/**
 * Prefer a real venue column when one is present. Otherwise read the sector tag.
 * A missing column is not a coin-list fill.
 */
export function dexFromHolding(
  row: { venue?: string | null; chain?: string | null; sector?: string | null } | null | undefined
): { venue: "DEX" | null; chain: string | null } {
  const tagged = parseDexSector(row?.sector);
  const columnDex = row?.venue === "DEX";
  if (!columnDex && !tagged) return { venue: null, chain: null };
  return { venue: "DEX", chain: cleanChain(row?.chain) || tagged?.chain || null };
}

/** Notes prefix wins. A dropped venue column does not hide a DEX fill. */
export function dexFromLedger(
  row: { venue?: string | null; chain?: string | null; notes?: string | null } | null | undefined
): { venue: "DEX" | null; chain: string | null; note: string } {
  const tagged = parseDexNotes(row?.notes);
  const note = tagged ? tagged.note : row?.notes || "";
  if (tagged || row?.venue === "DEX") {
    return { venue: "DEX", chain: tagged?.chain || cleanChain(row?.chain), note };
  }
  return { venue: null, chain: null, note };
}

/** Sector charts group every DEX tag together instead of one slice per chain. */
export function sectorGroup(sector?: string | null): string {
  if (parseDexSector(sector)) return "DEX";
  const name = (sector || "").trim();
  return name || "Other";
}

/** Company and name lines skip the DEX storage tag. */
export function holdingTitle(row: {
  company_name?: string | null;
  sector?: string | null;
  ticker?: string | null;
}): string {
  const sector = parseDexSector(row.sector) ? "" : (row.sector || "").trim();
  return row.company_name || sector || row.ticker || "—";
}
