/**
 * Whether a member's book is loaded, and the facts a Stox or Koins report
 * may state about it. Pure — no quotes are fetched or invented here.
 */

import { inferMetalKey, isBullionHolding } from "@/lib/metal-valuation";

export interface BookRow {
  asset_type?: string | null;
  ticker?: string | null;
  shares?: number | null;
  company_name?: string | null;
}

export interface MetalRow {
  metal?: string | null;
  ounces?: number | null;
}

export interface PortfolioBook {
  stockLots: number;
  cryptoLots: number;
  goldOunces: number;
  silverOunces: number;
  cashNZD: number;
}

export interface CoveragePosition {
  label: string;
  sublabel?: string;
  assetClass: "equities" | "crypto" | "metals" | "cash";
  valueNZD: number;
}

export function readPortfolioBook(
  rows: BookRow[],
  metals: MetalRow[],
  cashNZD: number
): PortfolioBook {
  let stockLots = 0;
  let cryptoLots = 0;
  let goldOunces = 0;
  let silverOunces = 0;
  for (const row of rows) {
    const shares = Number(row.shares) || 0;
    if (!(shares > 0)) continue;
    const asset = (row.asset_type || "stock").trim().toLowerCase();
    if (asset === "metal" || isBullionHolding(row.asset_type, row.ticker, row.company_name)) {
      const key = inferMetalKey({
        ticker: row.ticker,
        assetType: row.asset_type,
        companyName: row.company_name,
      });
      if (key === "silver") silverOunces += shares;
      else goldOunces += shares;
      continue;
    }
    if (asset === "crypto") cryptoLots += 1;
    else stockLots += 1;
  }
  for (const metal of metals) {
    const ounces = Number(metal.ounces) || 0;
    if (!(ounces > 0)) continue;
    if ((metal.metal || "").trim().toLowerCase() === "silver") silverOunces += ounces;
    else goldOunces += ounces;
  }
  return {
    stockLots,
    cryptoLots,
    goldOunces,
    silverOunces,
    cashNZD: Number.isFinite(cashNZD) ? Math.max(0, cashNZD) : 0,
  };
}

/** True when any stocks, crypto, gold, silver, or cash are on the book. */
export function portfolioIsLoaded(book: PortfolioBook, positions: CoveragePosition[] = []): boolean {
  if (book.stockLots > 0 || book.cryptoLots > 0 || book.goldOunces > 0 || book.silverOunces > 0 || book.cashNZD > 0) {
    return true;
  }
  return positions.some((position) => {
    if (position.assetClass === "cash") return position.valueNZD > 0;
    return position.valueNZD > 0 || !!position.label;
  });
}

function qty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
}

function money(n: number): string {
  return `NZ$${Math.round(n)}`;
}

/**
 * Factual lines for a loaded book. Metal spot is omitted when that feed is down.
 * An empty book returns no lines — there is no portfolio to describe.
 */
export function portfolioCoverageLines(args: {
  book: PortfolioBook;
  positions?: CoveragePosition[];
  metalsFeedLive?: boolean;
}): string[] {
  const positions = args.positions ?? [];
  if (!portfolioIsLoaded(args.book, positions)) return [];
  const lines: string[] = [];
  const ofClass = (assetClass: CoveragePosition["assetClass"]) =>
    positions.filter((position) => position.assetClass === assetClass);

  const equities = ofClass("equities");
  if (args.book.stockLots > 0 || equities.length) {
    const names = equities.map((position) => position.label).filter(Boolean);
    const value = equities.reduce((sum, position) => sum + (position.valueNZD || 0), 0);
    lines.push(
      names.length
        ? `Equities on the book: ${names.join(", ")}${value > 0 ? ` (${money(value)})` : ""}.`
        : `Equities on the book: ${args.book.stockLots} position${args.book.stockLots === 1 ? "" : "s"}.`
    );
  }

  const crypto = ofClass("crypto");
  if (args.book.cryptoLots > 0 || crypto.length) {
    const names = crypto.map((position) => position.label).filter(Boolean);
    const value = crypto.reduce((sum, position) => sum + (position.valueNZD || 0), 0);
    lines.push(
      names.length
        ? `Crypto on the book: ${names.join(", ")}${value > 0 ? ` (${money(value)})` : ""}.`
        : `Crypto on the book: ${args.book.cryptoLots} position${args.book.cryptoLots === 1 ? "" : "s"}.`
    );
  }

  const metalPositions = ofClass("metals");
  if (args.book.goldOunces > 0 || args.book.silverOunces > 0 || metalPositions.length) {
    const bits: string[] = [];
    if (args.book.goldOunces > 0) bits.push(`${qty(args.book.goldOunces)} oz gold`);
    if (args.book.silverOunces > 0) bits.push(`${qty(args.book.silverOunces)} oz silver`);
    const labels = metalPositions
      .map((position) => (position.sublabel ? `${position.label} (${position.sublabel})` : position.label))
      .filter(Boolean);
    const who = [bits.join(", "), labels.join(", ")].filter(Boolean).join("; ") || "held";
    if (args.metalsFeedLive === false) {
      lines.push(
        `Precious metals on the book: ${who}. The precious-metals feed is unavailable, so no spot price is quoted.`
      );
    } else {
      const value = metalPositions.reduce((sum, position) => sum + (position.valueNZD || 0), 0);
      lines.push(`Precious metals on the book: ${who}${value > 0 ? ` (${money(value)})` : ""}.`);
    }
  }

  const cashFromPositions = ofClass("cash").reduce((sum, position) => sum + (position.valueNZD || 0), 0);
  const cash = args.book.cashNZD > 0 ? args.book.cashNZD : cashFromPositions;
  if (cash > 0) lines.push(`Ledger cash: ${money(cash)}.`);
  return lines;
}

/** Sentence placed inside a Stox or Koins report when that bot's market feed returned nothing. */
export function marketFeedUnavailableLine(bot: "stock" | "crypto"): string {
  return bot === "crypto"
    ? "The crypto market feed is unavailable for this run. No prices or quotes were filled in."
    : "The equity market feed is unavailable for this run. No prices or quotes were filled in.";
}
