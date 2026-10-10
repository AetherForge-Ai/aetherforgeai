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
