/**
 * Indicative FIF working paper.
 * Cost is taken from the ledger. Opening and closing market values are entered
 * by the member and stored in the existing stock.notes field. A missing market
 * value is not filled from a live price.
 *
 * pull-check:track-b-2-2026-10-11
 */

import { formatNzd, roundMoney } from "@/lib/currency";
import { dividendViewFromRow } from "@/lib/dividend-ledger";
import { lotCivilDay } from "@/lib/executed-at";
import { inNzTaxYear, nzTaxYearLabel } from "@/lib/nz-tax-year";
import type { TaxLedgerRow } from "@/lib/taxable-income";

export const FIF_COST_THRESHOLD_NZD = 50000;

export const FIF_SOURCES = [
  {
    href: "https://www.ird.govt.nz/foreign-investment-funds",
    label: "Inland Revenue — Foreign investment funds",
  },
  {
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-income/foreign-investment-funds-fifs/foreign-investment-fund-rules-exemptions",
    label: "Inland Revenue — Foreign investment fund rules exemptions",
  },
  {
    href: "https://www.taxtechnical.ird.govt.nz/new-legislation/act-articles/taxation-international-investment-and-remedial-matters-act-2012/applying-the-fif-rules/exemption-for-natural-persons-with-less-than-50-000-of-fif-interests",
    label: "Inland Revenue Tax Technical — exemption under $50,000 (section CQ 5)",
  },
  {
    href: "https://www.taxtechnical.ird.govt.nz/technical-decision-summaries/2026/tds-26-01",
    label: "Inland Revenue — TDS 26/01, opening value of the fair dividend rate",
  },
  {
    href: "https://www.taxtechnical.ird.govt.nz/technical-decision-summaries/2023/tds-23-13",
    label: "Inland Revenue — TDS 23/13, comparative value formula",
  },
] as const;

export const FIF_ASSUMPTIONS = [
  "This paper is indicative. It does not decide whether the FIF rules apply to you.",
  "A ticker ending in .NZ is treated as a New Zealand share and is left out.",
  "A ticker ending in .AX is treated as Australian listed and is left out of the $50,000 total. Inland Revenue says the exemption applies when the company is on the official ASX list, is Australian resident and not treated as resident in another country under a treaty, maintains a franking account, and the stock is not stapled. This book cannot check those four points. If one fails, add that cost back.",
  "Crypto and metals are left out. This paper does not treat them as shares in a foreign company.",
  "Other share tickers are treated as attributing interests for this paper.",
  "Cost is quantity times price times the exchange rate stored on the buy, in NZ$. A foreign buy with no stored rate is not given a guessed rate, and the $50,000 test is then not calculated.",
  "The $50,000 test uses the highest total cost of attributing lots open at any point in the income year, including lots still open on 1 April. It is cost, not market value.",
  "Exactly NZ$50,000.00 is reported as at the limit. The public exemptions page says the de minimis exemption is for attributing interests that cost less than NZ$50,000. The Tax Technical article on section CQ 5 says FIF income arises when the total cost at any time in the income year is more than $50,000. This paper does not choose which sentence applies at exactly NZ$50,000.00.",
  "Fair dividend rate shown here is 5% of the opening market value you entered. TDS 26/01 describes the formula as (0.05 × opening value) + quick sale adjustment. This paper does not calculate a quick sale adjustment.",
  "Comparative value is (closing market value + gains) − (opening market value + costs), the formula TDS 23/13 quotes from section EX 51. Gains are dividend gross in NZ$ plus sale proceeds in NZ$ during the year. Costs are the NZ$ cost of shares bought during the year. Fees are not added. A dividend without a stored gross is not included.",
  "Opening and closing market values are figures you enter for the position. A live price is not used as the 1 April or 31 March value.",
  "Both methods are shown. Inland Revenue says you must use the same method for every attributing interest under 10% where both methods are available. This paper does not choose a method.",
  "Corrections are not replayed. Cost follows buy, opening balance and sell rows.",
  "This paper reads up to 5,000 ledger rows.",
] as const;

export type FifClass = "attributable" | "australian" | "new-zealand" | "not-a-share";
export type FifThreshold = "under" | "at-limit" | "over" | "unknown";

export interface FifMarketInput {
  ticker: string;
  openingNzd: number | null;
  closingNzd: number | null;
}

export interface FifPosition {
  ticker: string;
  className: FifClass;
  /** Cost of lots still open at 31 March. Null when a rate was missing. */
  costNzd: number | null;
  openingNzd: number | null;
  closingNzd: number | null;
  /** 5% of opening market value. Null when opening was not entered. */
  fdrNzd: number | null;
  /** Null when opening or closing was not entered, or a sale had no rate. */
  cvNzd: number | null;
  gainsNzd: number;
  costsInYearNzd: number;
  omittedDividendCash: boolean;
}

export interface FifPaper {
  endingYear: number;
  label: string;
  attributing: FifPosition[];
  australian: FifPosition[];
  newZealand: string[];
  notShares: string[];
  /** Highest attributing cost during the year. Null when a rate was missing. */
  peakCostNzd: number | null;
  threshold: FifThreshold;
  assumptions: readonly string[];
  sources: readonly { href: string; label: string }[];
}

export function fifClass(ticker: string, assetType: string | null | undefined): FifClass {
  const kind = String(assetType || "").toLowerCase();
  if (kind === "crypto" || kind === "metal" || kind === "cash") return "not-a-share";
  const symbol = ticker.trim().toUpperCase();
  if (symbol === "GOLD" || symbol === "SILVER") return "not-a-share";
  if (symbol.endsWith(".NZ") || symbol.endsWith(".NZX")) return "new-zealand";
  if (symbol.endsWith(".AX") || symbol.endsWith(".ASX")) return "australian";
  if (!symbol) return "not-a-share";
  return "attributable";
}

function civil(value: string | null | undefined): string {
  return lotCivilDay(value || "", "");
}

function yearStart(endingYear: number): string {
  return `${endingYear - 1}-04-01`;
}

function fxOf(row: TaxLedgerRow): number | null {
  const currency = String(row.currency || "NZD").toUpperCase();
  if (currency === "NZD") return 1;
  const fx = Number(row.fx_rate);
  if (fx > 0 && Number.isFinite(fx)) return fx;
  return null;
}

function nzdCost(qty: number, price: number, fx: number): number {
  return roundMoney(qty * price * fx);
}

interface Lot {
  qty: number;
  costNzd: number;
}

interface Working {
  lots: Lot[];
  unknown: boolean;
  yearEndCost: number;
  gainsNzd: number;
  costsInYearNzd: number;
  cvBlocked: boolean;
  omittedDividendCash: boolean;
}

function emptyWorking(): Working {
  return {
    lots: [],
    unknown: false,
    yearEndCost: 0,
    gainsNzd: 0,
    costsInYearNzd: 0,
    cvBlocked: false,
    omittedDividendCash: false,
  };
}

function holdingCost(lots: Lot[]): number {
  return roundMoney(lots.reduce((sum, lot) => sum + lot.costNzd, 0));
}

function addLot(working: Working, qty: number, cost: number) {
  working.lots.push({ qty, costNzd: cost });
}

function removeQty(working: Working, qty: number, fx: number | null, price: number, inYear: boolean) {
  let left = qty;
  const next: Lot[] = [];
  for (const lot of working.lots) {
    if (left <= 1e-9) {
      next.push(lot);
      continue;
    }
    const take = Math.min(lot.qty, left);
    const removedCost = lot.qty > 0 ? roundMoney((take / lot.qty) * lot.costNzd) : 0;
    const remainQty = lot.qty - take;
    if (remainQty > 1e-9) {
      next.push({ qty: remainQty, costNzd: roundMoney(lot.costNzd - removedCost) });
    }
    left -= take;
  }
  working.lots = next;
  if (left > 1e-6) working.unknown = true;
  if (inYear) {
    if (fx == null) working.cvBlocked = true;
    else working.gainsNzd = roundMoney(working.gainsNzd + nzdCost(qty, price, fx));
  }
}

export function fdrIncome(openingNzd: number | null): number | null {
  if (openingNzd == null) return null;
  return roundMoney(openingNzd * 0.05);
}

export function comparativeValue(input: {
  openingNzd: number | null;
  closingNzd: number | null;
  gainsNzd: number;
  costsNzd: number;
}): number | null {
  if (input.openingNzd == null || input.closingNzd == null) return null;
  return roundMoney(input.closingNzd + input.gainsNzd - (input.openingNzd + input.costsNzd));
}

export function fifThreshold(peakCostNzd: number | null): FifThreshold {
  if (peakCostNzd == null) return "unknown";
  if (peakCostNzd < FIF_COST_THRESHOLD_NZD) return "under";
  if (peakCostNzd === FIF_COST_THRESHOLD_NZD) return "at-limit";
  return "over";
}

/** Sentence shown on the working paper. An empty attributing book is not called "under". */
export function fifThresholdSentence(paper: Pick<FifPaper, "peakCostNzd" | "threshold" | "attributing">): string {
  if (paper.attributing.length === 0 && paper.threshold !== "unknown") {
    return "No attributing overseas shares on this book.";
  }
  if (paper.threshold === "unknown" || paper.peakCostNzd == null) {
    return "The $50,000 cost test is not calculated because a foreign attributing buy has no stored exchange rate.";
  }
  const cost = formatNzd(paper.peakCostNzd);
  if (paper.threshold === "under") {
    return `Highest attributing cost in this income year is ${cost}. That is under NZ$50,000.00.`;
  }
  if (paper.threshold === "at-limit") {
    return `Highest attributing cost in this income year is ${cost}. That is exactly NZ$50,000.00.`;
  }
  return `Highest attributing cost in this income year is ${cost}. That is over NZ$50,000.00.`;
}

function positionFrom(
  ticker: string,
  className: FifClass,
  working: Working,
  market: FifMarketInput | undefined
): FifPosition {
  const openingNzd = market?.openingNzd ?? null;
  const closingNzd = market?.closingNzd ?? null;
  const costNzd = working.unknown ? null : working.yearEndCost;
  return {
    ticker,
    className,
    costNzd,
    openingNzd,
    closingNzd,
    fdrNzd: className === "attributable" ? fdrIncome(openingNzd) : null,
    cvNzd:
      className === "attributable" && !working.cvBlocked
        ? comparativeValue({
            openingNzd,
            closingNzd,
            gainsNzd: working.gainsNzd,
            costsNzd: working.costsInYearNzd,
          })
        : null,
    gainsNzd: working.gainsNzd,
    costsInYearNzd: working.costsInYearNzd,
    omittedDividendCash: working.omittedDividendCash,
  };
}

export function buildFifPaper(input: {
  rows: readonly TaxLedgerRow[];
  markets: readonly FifMarketInput[];
  endingYear: number;
}): FifPaper {
  const start = yearStart(input.endingYear);
  const books = new Map<string, { className: FifClass; assetType: string; working: Working }>();
  const events = input.rows
    .filter((row) => row.type === "buy" || row.type === "sell" || row.type === "opening_balance")
    .map((row) => ({ row, day: civil(row.executed_at || row.createdAt) }))
    .filter((event) => event.day)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.row.type).localeCompare(String(b.row.type)));

  let peak: number | null = 0;
  let seenOpening = false;

  function attributingCost(): number | null {
    let total = 0;
    for (const book of books.values()) {
      if (book.className !== "attributable") continue;
      if (book.working.unknown) return null;
      total = roundMoney(total + holdingCost(book.working.lots));
    }
    return total;
  }

  function notePeak() {
    if (peak == null) return;
    const cost = attributingCost();
    if (cost == null) {
      peak = null;
      return;
    }
    if (cost > peak) peak = cost;
  }

  for (const event of events) {
    if (!seenOpening && event.day >= start) {
      seenOpening = true;
      notePeak();
    }
    if (event.day > `${input.endingYear}-03-31`) break;
    const row = event.row;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const className = fifClass(ticker, row.asset_type);
    if (className === "not-a-share" || !ticker) continue;
    let book = books.get(ticker);
    if (!book) {
      book = { className, assetType: String(row.asset_type || ""), working: emptyWorking() };
      books.set(ticker, book);
    }
    const qty = Number(row.quantity) || 0;
    const price = Number(row.price) || 0;
    const fx = fxOf(row);
    const inYear = event.day >= start;
    if (row.type === "sell") {
      if (!(qty > 0)) continue;
      removeQty(book.working, qty, fx, price, inYear);
    } else if (qty > 0 && price > 0) {
      if (fx == null) book.working.unknown = true;
      else {
        const cost = nzdCost(qty, price, fx);
        addLot(book.working, qty, cost);
        if (inYear) book.working.costsInYearNzd = roundMoney(book.working.costsInYearNzd + cost);
      }
    }
    if (inYear || event.day >= start) notePeak();
  }
  if (!seenOpening) notePeak();

  for (const row of input.rows) {
    if (row.type !== "dividend" || !inNzTaxYear(row.executed_at || row.createdAt, input.endingYear)) continue;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const book = books.get(ticker);
    if (!book || book.className !== "attributable") continue;
    const view = dividendViewFromRow(row);
    if (!view.parts) book.working.omittedDividendCash = true;
    else book.working.gainsNzd = roundMoney(book.working.gainsNzd + view.parts.grossNzd);
  }

  for (const book of books.values()) {
    book.working.yearEndCost = book.working.unknown ? 0 : holdingCost(book.working.lots);
  }

  const markets = new Map(input.markets.map((market) => [market.ticker.trim().toUpperCase(), market]));
  const attributing: FifPosition[] = [];
  const australian: FifPosition[] = [];
  const newZealand: string[] = [];
  const notShares = new Set<string>();
  for (const row of input.rows) {
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!ticker) continue;
    if (fifClass(ticker, row.asset_type) === "not-a-share") notShares.add(ticker);
  }
  for (const [ticker, book] of books) {
    const position = positionFrom(ticker, book.className, book.working, markets.get(ticker));
    if (book.className === "attributable") attributing.push(position);
    else if (book.className === "australian") australian.push(position);
    else if (book.className === "new-zealand") newZealand.push(ticker);
  }
  attributing.sort((a, b) => a.ticker.localeCompare(b.ticker));
  australian.sort((a, b) => a.ticker.localeCompare(b.ticker));
  newZealand.sort();

  return {
    endingYear: input.endingYear,
    label: nzTaxYearLabel(input.endingYear),
    attributing,
    australian,
    newZealand,
    notShares: [...notShares].sort(),
    peakCostNzd: peak,
    threshold: fifThreshold(peak),
    assumptions: FIF_ASSUMPTIONS,
    sources: FIF_SOURCES,
  };
}

const FIF_TAG = /\[FIFMV:(\d{4}):([^\]]*)\]/g;

export interface StoredFifMarket extends FifMarketInput {
  year: number;
}

export function readFifMarkets(notes?: string | null): StoredFifMarket[] {
  const found: StoredFifMarket[] = [];
  for (const match of String(notes || "").matchAll(FIF_TAG)) {
    const bag = new Map<string, string>();
    for (const piece of match[2].split(";")) {
      const eq = piece.indexOf("=");
      if (eq <= 0) continue;
      bag.set(piece.slice(0, eq), piece.slice(eq + 1));
    }
    const read = (key: string): number | null => {
      if (!bag.has(key)) return null;
      const n = Number(bag.get(key));
      return Number.isFinite(n) ? roundMoney(n) : null;
    };
    found.push({ ticker: "", year: Number(match[1]), openingNzd: read("o"), closingNzd: read("c") });
  }
  return found;
}

export function stripFifMarketNotes(notes?: string | null): string {
  return String(notes || "")
    .replace(/\[FIFMV:\d{4}:[^\]]*\]\s*/g, "")
    .trim();
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

/** Market values for one tax year, keyed by the holding ticker. Notes never invent a ticker. */
export function marketsFromNotes(
  stocks: readonly { ticker: string; notes?: string | null }[],
  year: number
): FifMarketInput[] {
  const byTicker = new Map<string, FifMarketInput>();
  for (const stock of stocks) {
    const ticker = stock.ticker.trim().toUpperCase();
    if (!ticker) continue;
    const hit = readFifMarkets(stock.notes).find((row) => row.year === year);
    if (!hit) continue;
    byTicker.set(ticker, { ticker, openingNzd: hit.openingNzd, closingNzd: hit.closingNzd });
  }
  return [...byTicker.values()];
}

export function stockForTicker<T extends { ticker: string; shares: number }>(rows: readonly T[], ticker: string): T | null {
  const symbol = ticker.trim().toUpperCase();
  const matches = rows.filter((row) => row.ticker.trim().toUpperCase() === symbol);
  return matches.find((row) => row.shares > 0) || matches[0] || null;
}

/** Merge one year's market values into stock.notes. Nulls drop that side. Both nulls drop the year. */
export function withFifMarketNotes(
  notes: string | null | undefined,
  year: number,
  openingNzd: number | null,
  closingNzd: number | null
): string {
  const kept = readFifMarkets(notes).filter((row) => row.year !== year);
  if (openingNzd != null || closingNzd != null) {
    kept.push({ ticker: "", year, openingNzd, closingNzd });
  }
  const tags = kept
    .sort((a, b) => a.year - b.year)
    .map((row) => {
      const parts = [`[FIFMV:${row.year}:`];
      const bits: string[] = [];
      if (row.openingNzd != null) bits.push(`o=${money(row.openingNzd)}`);
      if (row.closingNzd != null) bits.push(`c=${money(row.closingNzd)}`);
      return `${parts[0]}${bits.join(";")}]`;
    });
  const body = stripFifMarketNotes(notes);
  return [tags.join(""), body].filter(Boolean).join(" ");
}
