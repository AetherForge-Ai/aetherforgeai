/**
 * Broker sync step 1: IBKR Flex Web Service (read-only reports).
 * SendRequest?t=TOKEN&q=QUERY_ID&v=3 → ReferenceCode; GetStatement?t=TOKEN&q=REF&v=3 → statement.
 * Docs: interactivebrokers.com/docs/web-api/api-reference/send-request.md and get-statement.md.
 * Pure helpers only (no network), so they are unit-tested; the server module does the fetches.
 */

export const IBKR_FLEX_BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
/** IBKR requires a User-Agent header on Flex Web Service calls. */
export const IBKR_USER_AGENT = "AetherForgeAI-BrokerSync/1.0";

export function sendRequestUrl(token: string, queryId: string): string {
  return `${IBKR_FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
}
export function getStatementUrl(token: string, reference: string): string {
  return `${IBKR_FLEX_BASE}/GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(reference)}&v=3`;
}

/** Flex tokens are long digit strings; Query IDs are digits. Anything else is refused before a call. */
export function validFlexToken(token: string): boolean {
  return /^[0-9]{10,40}$/.test(String(token || "").trim());
}
export function validQueryId(id: string): boolean {
  return /^[0-9]{3,12}$/.test(String(id || "").trim());
}

function tag(xml: string, name: string): string {
  return new RegExp(`<${name}>([^<]*)</${name}>`, "i").exec(xml)?.[1]?.trim() ?? "";
}

export type FlexAnswer =
  | { ok: true; reference: string; url?: string }
  | { ok: false; code: string; message: string; retry: boolean };

/** Plain-English messages for the Flex error codes members actually hit. */
export const FLEX_ERRORS: Record<string, string> = {
  "1003": "IBKR says the statement is not available yet. Try again later.",
  "1012": "Your IBKR Flex token has expired. Make a new token in IBKR and connect again.",
  "1013": "IBKR refused the call because your Flex token is restricted to other IP addresses. In IBKR, remove the IP restriction on the token (or allow our server), then connect again.",
  "1014": "IBKR says the Query ID is not valid. Check the Flex Query ID.",
  "1015": "IBKR says the token is not valid. Check the Flex token.",
  "1018": "IBKR is limiting requests for this token. Try again in a minute.",
  "1019": "IBKR is still generating the statement.",
  "1020": "IBKR says the request was not valid.",
};
const RETRY_CODES = new Set(["1001", "1003", "1004", "1005", "1006", "1007", "1008", "1009", "1018", "1019", "1021"]);

export function parseFlexResponse(xml: string): FlexAnswer {
  const status = tag(xml, "Status");
  if (/^success$/i.test(status)) {
    const reference = tag(xml, "ReferenceCode");
    if (reference) return { ok: true, reference, url: tag(xml, "Url") || undefined };
  }
  const code = tag(xml, "ErrorCode") || "unknown";
  const message = FLEX_ERRORS[code] || "IBKR did not return the statement. Try again later.";
  return { ok: false, code, message, retry: RETRY_CODES.has(code) };
}

/** A GetStatement answer that is still the "please wait" envelope rather than the statement. */
export function statementPending(body: string): FlexAnswer | null {
  if (/<FlexStatementResponse/i.test(body)) return parseFlexResponse(body);
  return null;
}

function attrs(el: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of el.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'");
  return out;
}
function elements(xml: string, name: string): Record<string, string>[] {
  return [...xml.matchAll(new RegExp(`<${name}\\s[^>]*?/?>`, "g"))].map((m) => attrs(m[0]));
}

const TRADE_COLUMNS = ["TradeID", "ClientAccountID", "AssetClass", "Symbol", "Description", "TradeDate", "Quantity", "TradePrice", "IBCommission", "Buy/Sell", "CurrencyPrimary", "FXRateToBase", "Proceeds"];

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Stock trades in a Flex XML statement as the Flex trade CSV the H-10 IBKR parser reads. */
export function flexTradesCsv(xml: string): string {
  const rows = elements(xml, "Trade").filter((t) => (t.assetCategory || t.AssetClass || "STK") === "STK" && (t.levelOfDetail || "EXECUTION").toUpperCase() !== "SYMBOL_SUMMARY");
  const lines = [TRADE_COLUMNS.join(",")];
  for (const t of rows) {
    lines.push(
      [
        t.tradeID || t.ibExecID || "",
        t.accountId || "",
        t.assetCategory || "STK",
        t.symbol || "",
        t.description || "",
        t.tradeDate || "",
        t.quantity || "",
        t.tradePrice || "",
        t.ibCommission || "0",
        t.buySell || "",
        t.currency || "",
        t.fxRateToBase || "",
        t.proceeds || "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

export interface FlexCashRow {
  id: string;
  kind: "dividend" | "deposit" | "withdraw";
  date: string;
  symbol: string;
  amount: number;
  currency: string;
  fxRateToBase: number | null;
  description: string;
}

function flexDate(raw: string): string {
  const d = String(raw || "").replace(/[;,\s].*$/, "");
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(d);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** Dividends and deposits/withdrawals from <CashTransaction>. Withholding and fees are left out. */
export function flexCashRows(xml: string): FlexCashRow[] {
  const out: FlexCashRow[] = [];
  for (const c of elements(xml, "CashTransaction")) {
    const type = (c.type || "").toLowerCase();
    const amount = Number(c.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const id = c.transactionID || c.tradeID || "";
    if (!id) continue;
    const date = flexDate(c.dateTime || c.settleDate || c.reportDate || "");
    if (!date) continue;
    const fx = Number(c.fxRateToBase);
    const base = { id: `ibkrcash-${id}`, date, symbol: c.symbol || "", currency: c.currency || "", fxRateToBase: Number.isFinite(fx) && fx > 0 ? fx : null, description: c.description || "" };
    if (type === "dividends" || type === "payment in lieu of dividends") {
      if (amount > 0 && base.symbol) out.push({ ...base, kind: "dividend", amount });
    } else if (type === "deposits/withdrawals" || type === "deposits & withdrawals") {
      out.push({ ...base, kind: amount > 0 ? "deposit" : "withdraw", amount: Math.abs(amount) });
    }
  }
  return out;
}
