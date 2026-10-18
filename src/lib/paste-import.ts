/**
 * Goal b19 G-24: paste-anything import, rule-based. Email or contract-note text
 * becomes a CSV that the normal import review screen reads, so nothing is saved
 * before the member reviews and confirms. AI reading of PDFs and screenshots is
 * OFF by default (PASTE_IMPORT_AI=1 to allow, and not built while off); with it
 * off, only text is read and nothing leaves the app.
 */
export const PASTE_IMPORT_AI_ENABLED = process.env.NEXT_PUBLIC_PASTE_IMPORT_AI === "1";
export const PASTE_CSV_HEADERS = ["Date", "Type", "Ticker", "Quantity", "Price", "Currency", "Fees", "Reference"] as const;

export interface PastedRow {
  date: string | null;
  type: "Buy" | "Sell";
  ticker: string;
  quantity: number;
  price: number;
  currency: string | null;
  fees: number | null;
  reference: string | null;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

export function findDate(s: string): string | null {
  let m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d{2})\b/i.exec(s);
  if (m) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  m = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(s); // NZ order: day/month/year
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function currencyOf(prefix: string | undefined, suffix: string | undefined): string | null {
  const p = (prefix || suffix || "").toUpperCase().replace(/\s/g, "");
  if (/^(NZ\$|NZD)$/.test(p)) return "NZD";
  if (/^(US\$|USD)$/.test(p)) return "USD";
  if (/^(A\$|AU\$|AUD)$/.test(p)) return "AUD";
  return null; // a bare "$" is not guessed
}

const num = (s: string) => Number(s.replace(/,/g, ""));
const MONEY = String.raw`(NZ\$|US\$|AU\$|A\$|NZD\s?|USD\s?|AUD\s?|\$)?\s?([\d,]+(?:\.\d+)?)(?:\s?(NZD|USD|AUD))?`;
const TRADE = new RegExp(
  String.raw`\b(bought|buy|purchased?|sold|sell)\b[^\d\n]{0,20}([\d,]+(?:\.\d+)?)\s*(?:x\s*)?(?:shares?|units?|of)?\s*(?:of\s+)?([A-Z][A-Z0-9]{0,9}(?:\.[A-Z]{1,3})?)\b[^\n]{0,40}?(?:@|\bat\b|price(?:\s+of)?:?)\s*` + MONEY,
  "i"
);

export function parsePastedTrades(text: string): { rows: PastedRow[]; unread: string[] } {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n|(?<=[.;])\s+(?=(?:you\s+)?(?:bought|sold|buy|sell)\b)/i);
  const globalDate = findDate(text);
  const rows: PastedRow[] = [];
  const unread: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let hit = false;
    for (const line of lines) {
      const m = TRADE.exec(line);
      if (!m) continue;
      hit = true;
      const fee = /(?:brokerage|commission|fees?)\s*:?\s*(?:NZ\$|US\$|A\$|\$)?\s?([\d,]+(?:\.\d+)?)/i.exec(block);
      const ref = /(?:contract note|confirmation|order|reference|ref)\s*(?:no\.?|number|#|id)?\s*:?\s*([A-Z0-9-]{4,})/i.exec(block);
      rows.push({
        date: findDate(line) ?? findDate(block) ?? globalDate,
        type: /^(sold|sell)$/i.test(m[1]) ? "Sell" : "Buy",
        ticker: m[3].toUpperCase(),
        quantity: num(m[2]),
        price: num(m[5]),
        currency: currencyOf(m[4]?.trim(), m[6]),
        fees: fee ? num(fee[1]) : null,
        reference: ref ? ref[1] : null,
      });
    }
    if (!hit && /\b(bought|sold|buy|sell)\b/i.test(block)) unread.push(block.trim().slice(0, 120));
  }
  return { rows, unread };
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function pastedRowsToCsv(rows: readonly PastedRow[]): string {
  const out = [PASTE_CSV_HEADERS.join(",")];
  for (const r of rows) {
    out.push([r.date ?? "", r.type, r.ticker, String(r.quantity), String(r.price), r.currency ?? "", r.fees == null ? "" : String(r.fees), r.reference ?? ""].map(cell).join(","));
  }
  return `${out.join("\n")}\n`;
}
