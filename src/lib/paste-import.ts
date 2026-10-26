/**
 * Goal b19 G-24: paste-anything import, rule-based. Email or contract-note text
 * becomes a CSV that the normal import review screen reads, so nothing is saved
 * before the member reviews and confirms. AI reading of PDFs and screenshots is
 * OFF by default (PASTE_IMPORT_AI=1 to allow, and not built while off); with it
 * off, only text is read and nothing leaves the app.
 */
export const PASTE_IMPORT_AI_ENABLED = process.env.NEXT_PUBLIC_PASTE_IMPORT_AI === "1";
export const PASTE_CSV_HEADERS = ["Date", "Type", "Ticker", "Quantity", "Price", "Currency", "Fees", "Reference"] as const;

/** b41 G-24: the pasted CSV's own columns, sent with it so the column mapper is never shown. */
export const PASTE_COLUMN_MAP: Readonly<Record<string, string>> = {
  date: "Date",
  side: "Type",
  ticker: "Ticker",
  quantity: "Quantity",
  price: "Price",
  currency: "Currency",
  fee: "Fees",
};

/** b41 G-24: NZ$ value of a reviewed row (quantity × price ± fee, or a dividend net of tax), or null without a rate. */
export function pastedRowNzd(r: PastedRow, ratesToNZD: Readonly<Record<string, number>> | null): number | null {
  const cur = r.currency || null;
  const rate = cur === "NZD" ? 1 : cur && ratesToNZD ? ratesToNZD[cur] : undefined;
  if (!rate || !(rate > 0)) return null;
  const fee = r.fees ?? 0;
  const gross = r.type === "Dividend" ? r.price - (r.tax ?? 0) : r.quantity * r.price + (r.type === "Buy" ? fee : -fee);
  return Math.round(gross * rate * 100) / 100;
}

export interface PastedRow {
  date: string | null;
  type: "Buy" | "Sell" | "Dividend";
  ticker: string;
  quantity: number;
  price: number;
  currency: string | null;
  fees: number | null;
  reference: string | null;
  /** b41 G-24: withholding tax on a dividend, when the text gives it. */
  tax?: number | null;
}

/** b41 G-24: symbols read from pasted text without an exchange suffix (plus any NZ/AX ticker). */
export const PASTE_KNOWN_SYMBOLS = [
  "VOO", "VTI", "QQQ", "SPY", "IVV", "TSLA", "NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "GOOG", "META", "NFLX", "AMD",
  "BRK.B", "SOL", "BTC", "ETH", "XRP", "ADA", "DOGE", "USDT", "USDC", "XAU", "XAG",
] as const;
const KNOWN = new Set<string>(PASTE_KNOWN_SYMBOLS);
const NOT_TICKERS = new Set(["BUY", "SELL", "SOLD", "USD", "NZD", "AUD", "NZ", "US", "AU", "A", "FX", "OZ", "FEE", "FEES", "ORDER", "TRADE", "DATE", "THE", "YOU", "YOUR", "DIVIDEND", "PAID", "RECEIVED", "ON", "AT", "OF", "GOLD", "SILVER"]);

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

export function findDate(s: string): string | null {
  let m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d{2})\b/i.exec(s);
  if (m) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  // b41 G-24: "October 1, 2026" / "Oct 1 2026".
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i.exec(s);
  if (m) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
  // NZ order: day/month/year, with "/", "-" or "." (b41: "30-09-2026").
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/.exec(s);
  if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function currencyOf(prefix: string | undefined, suffix: string | undefined): string | null {
  // b41 G-24: "$248.50 USD" — a bare "$" defers to the code after the number.
  const pre = (prefix || "").toUpperCase().replace(/\s/g, "");
  const p = (pre && pre !== "$" ? pre : suffix || pre).toUpperCase().replace(/\s/g, "");
  if (/^(NZ\$|NZD)$/.test(p)) return "NZD";
  if (/^(US\$|USD)$/.test(p)) return "USD";
  if (/^(A\$|AU\$|AUD)$/.test(p)) return "AUD";
  return null; // a bare "$" is not guessed from the symbol alone
}

/** b41 G-24: a bare "$" on an NZX/ASX ticker is that market's dollar. */
function currencyForTicker(ticker: string): string | null {
  if (/\.NZ$/.test(ticker)) return "NZD";
  if (/\.AX$/.test(ticker)) return "AUD";
  return null;
}

/** b41 G-24: "1 oz gold (XAU)" is XAU, not OZ; a bracketed known symbol wins over a word. */
function fixTicker(raw: string, line: string): string {
  const t = raw.toUpperCase();
  const paren = /\(([A-Z]{2,6}(?:\.[A-Z]{2})?)\)/.exec(line)?.[1];
  if (NOT_TICKERS.has(t) || /^(OZS?|OUNCES?)$/.test(t)) {
    if (paren && !NOT_TICKERS.has(paren)) return paren;
    if (/\bgold\b/i.test(line)) return "XAU";
    if (/\bsilver\b/i.test(line)) return "XAG";
  }
  return t;
}

const num = (s: string) => Number(s.replace(/,/g, ""));
const MONEY = String.raw`(NZ\$|US\$|AU\$|A\$|NZD\s?|USD\s?|AUD\s?|\$)?\s?([\d,]+(?:\.\d+)?)(?:\s?(NZD|USD|AUD))?`;
const TRADE = new RegExp(
  String.raw`\b(bought|buy|purchased?|sold|sell)\b[^\d\n]{0,20}([\d,]+(?:\.\d+)?)\s*(?:x\s+)?(?:shares?|units?|of)?\s*(?:of\s+)?([A-Z][A-Z0-9]{0,9}(?:\.[A-Z]{1,3})?)\b[^\n]{0,40}?(?:@|\bat\s+an?\s+average\s+price\s+of\b|\bat\b|(?:average\s+)?price(?:\s+of)?:?|\bfor\b(?=[^\n]{0,30}\b(?:each|per\s+(?:share|unit))\b))\s*` + MONEY,
  "i"
);

const MONEY_RE = new RegExp(MONEY, "i");

/** b41 G-24: "Dividend paid AAPL US$1.25 on 22 Sep 2026 (withholding US$0.19)". */
export function readDividend(line: string): PastedRow | null {
  if (!/\bdividends?\b|\bdistribution\b/i.test(line)) return null;
  const tickers = [...line.matchAll(/\b([A-Z][A-Z0-9]{0,5}(?:\.(?:NZ|AX|[A-Z]))?)\b/g)].filter((t) => !NOT_TICKERS.has(t[1]) && /[A-Z]{2}/.test(t[1]));
  const pick = tickers.find((t) => /\.(NZ|AX)$/.test(t[1]) || KNOWN.has(t[1])) ?? tickers[0];
  if (!pick) return null;
  const ticker = pick[1];
  const rest = line.slice((pick.index ?? 0) + ticker.length);
  const taxAt = rest.search(/\b(withholding|withheld|wht|tax)\b/i);
  const main = taxAt >= 0 ? rest.slice(0, taxAt) : rest;
  // The amount carries a currency mark; a bare number (a date's day) is not an amount.
  const amt = new RegExp(String.raw`(NZ\$|US\$|AU\$|A\$|NZD\s?|USD\s?|AUD\s?|\$)\s?([\d,]+(?:\.\d+)?)|([\d,]+\.\d+)\s?(NZD|USD|AUD)?`, "i").exec(main);
  if (!amt) return null;
  const amount = num(amt[2] ?? amt[3]);
  if (!(amount > 0)) return null;
  const tax = taxAt >= 0 ? MONEY_RE.exec(rest.slice(taxAt)) : null;
  const curMark = amt[1]?.trim();
  return {
    date: findDate(line),
    type: "Dividend",
    ticker,
    quantity: 0,
    price: amount,
    currency: currencyOf(curMark, amt[4]) ?? (curMark === "$" || !curMark ? currencyForTicker(ticker) : null),
    fees: null,
    reference: null,
    tax: tax ? num(tax[2]) : null,
  };
}

export function parsePastedTrades(text: string): { rows: PastedRow[]; unread: string[] } {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n|(?<=[.;])\s+(?=(?:you\s+)?(?:bought|sold|buy|sell)\b)/i);
  const rows: PastedRow[] = [];
  const unread: string[] = [];
  const FEE = /(?:brokerage|commission|fees?)\s*:?\s*(?:of\s+)?(?:NZ\$|US\$|AU\$|A\$|\$|NZD\s?|USD\s?|AUD\s?)?\s?([\d,]+(?:\.\d+)?)(?![\d.,]*\s?%)/i;
  const REF_ALL = /(?:contract note|confirmation|order|reference|ref)[ \t]*(?:no\.?|number|#|id)?[ \t]*:?[ \t]*([A-Z0-9-]{4,})/gi;
  // A reference has at least one digit, so words like "filled" or "Contract" are not taken.
  const REF = { exec: (t: string) => { for (const m of t.matchAll(REF_ALL)) if (/\d/.test(m[1])) return m; return null; } };
  // b41 G-24: a header line's date ("Trades on 2026-10-01", "Confirmation 2026-09-01") covers the
  // note's trades when it is the only header date. A date on another trade's line never does.
  const textLines = text.replace(/\r/g, "").split("\n");
  const isHeader = (l: string) => !TRADE.test(l) && !readDividend(l);
  const headerAll = new Set(textLines.filter(isHeader).map((l) => findDate(l)).filter(Boolean));
  const noteDate = headerAll.size === 1 ? ([...headerAll][0] as string) : null;
  // The same physical line ("On 10 Apr you bought …; … You sold …") shares its date.
  const sameLineDate = (line: string) => findDate(textLines.find((l) => l.includes(line.trim())) ?? "");
  for (const block of blocks) {
    const lines = block.split("\n");
    // A date on a non-trade line of the block ("Trade date: …") is the block's date when it is the only one.
    const headerDates = new Set(lines.filter(isHeader).map((l) => findDate(l)).filter(Boolean));
    const blockDate = headerDates.size === 1 ? ([...headerDates][0] as string) : null;
    let hit = false;
    // Goal b20 G-24: fee and reference come from the trade's own line first. The
    // block is a fallback only when it holds exactly one trade, so a second trade
    // never borrows the first trade's fee.
    const tradeCount = lines.filter((line) => TRADE.test(line)).length;
    for (const line of lines) {
      const m = TRADE.exec(line);
      if (!m) continue;
      hit = true;
      const after = line.slice((m.index ?? 0) + m[0].length);
      const fee = FEE.exec(after) ?? FEE.exec(line) ?? (tradeCount === 1 ? FEE.exec(block) : null);
      const ticker = fixTicker(m[3], line);
      const ref = REF.exec(line) ?? (tradeCount === 1 ? REF.exec(block) : null);
      rows.push({
        // b41 G-24: a line with no date stays blank (the member must set it); the block's date is
        // used only when the block holds this one trade. Never today's date, never a date from a different trade line.
        date: findDate(line) ?? (tradeCount === 1 ? findDate(block) : null) ?? blockDate ?? sameLineDate(line) ?? noteDate,
        type: /^(sold|sell)$/i.test(m[1]) ? "Sell" : "Buy",
        ticker,
        quantity: num(m[2]),
        price: num(m[5]),
        currency: currencyOf(m[4]?.trim(), m[6]) ?? (m[4]?.trim() === "$" || !m[4] ? currencyForTicker(ticker) : null),
        fees: fee ? num(fee[1]) : null,
        reference: ref ? ref[1] : null,
      });
    }
    for (const line of lines) {
      if (TRADE.test(line)) continue;
      const d = readDividend(line);
      if (!d) continue;
      hit = true;
      rows.push({ ...d, date: d.date ?? blockDate ?? sameLineDate(line) ?? noteDate });
    }
    if (!hit && /\b(bought|sold|buy|sell|dividend)\b/i.test(block)) unread.push(block.trim().slice(0, 120));
  }
  return { rows, unread };
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function pastedRowsToCsv(rows: readonly PastedRow[]): string {
  const out = [PASTE_CSV_HEADERS.join(",")];
  for (const r of rows) {
    out.push([r.date ?? "", r.type, r.ticker, r.type === "Dividend" ? "" : String(r.quantity), String(r.price), r.currency ?? "", r.fees == null ? "" : String(r.fees), r.reference ?? ""].map(cell).join(","));
  }
  return `${out.join("\n")}\n`;
}
