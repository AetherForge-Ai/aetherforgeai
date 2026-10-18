/**
 * Where each column layout came from. The fixture files use these headers
 * and invented numbers. They are not customer exports.
 */

import { normHeader } from "@/lib/import/csv";
import { isIbkrActivity } from "@/lib/import/parsers/ibkr";
import type { BrokerId, ColumnMap } from "@/lib/import/types";

export const BROKER_LABEL: Record<BrokerId, string> = {
  sharesies: "Sharesies",
  hatch: "Hatch",
  ibkr: "IBKR",
  stake: "Stake",
  asb: "ASB Securities",
  jarden: "Jarden Direct",
  commsec: "CommSec",
  swyftx: "Swyftx",
  easycrypto: "Easy Crypto",
  generic: "Column map",
};

export const FORMAT_SOURCES: { broker: BrokerId; source: string }[] = [
  {
    broker: "sharesies",
    source:
      "Sharesies Transaction Report CSV columns listed in kevindoran/nzfiftax (Order ID, Trade date, Instrument code, Market code, Quantity, Price, Transaction type, Exchange rate, Exchange fee, Transaction fee, Currency, Amount). Export steps: Account → Generate Reports → Transaction Report CSV, as described by Portseido and Snowball Analytics.",
  },
  {
    broker: "hatch",
    source:
      "Hatch Help, “Understanding your Hatch tax reports” (help.hatchinvest.nz/en/articles/2938281, updated 19 May 2026): Date (NZ), Side, Symbol, Quantity, Price (USD), Notional Value (USD), Brokerage Fees (USD), FX Rate. FX Rate is the inverse of the NZD to USD rate.",
  },
  {
    broker: "ibkr",
    source:
      "IBKR Flex Query trade fields (ClientAccountID, TradeDate, Symbol, Quantity, TradePrice, IBCommission, Buy/Sell, CurrencyPrimary, FXRateToBase, Proceeds) and the activity-statement Trades section (Trades, Header, DataDiscriminator, T. Price, Comm/Fee) from ibkrguides.com “Trades - Default Activity Statement”.",
  },
  {
    broker: "stake",
    source:
      "Stake Investment activity workbook from Tax & reporting → Financial year reports (Sharesight’s Stake partner page and Portseido’s Stake export steps). Columns: Trade Date, Symbol, Side, Units, Avg Price, Brokerage, Currency, FX Rate. Stake’s download is XLSX; the fixture is that sheet as CSV.",
  },
  {
    broker: "asb",
    source:
      "ASB does not publish a CSV header row. Columns are the contract-note fields in the ASB Securities glossary (asb.co.nz/asb-securities/glossary-of-terms.html) and the order guide (asb.co.nz/asb-securities/placing-your-first-online-order-guide.html): contract note, trade date, settlement date, buy/sell, security code, quantity, price, brokerage.",
  },
  {
    broker: "jarden",
    source:
      "Jarden does not publish a CSV header row. Columns are the contract-note fields in the Jarden Securities terms (directbroking.co.nz, November 2023): price, number of securities, brokerage and fees, plus the confirmation number and exchange. Invest Direct (formerly Jarden Direct) otherwise sends trades to Sharesight by API.",
  },
  {
    broker: "commsec",
    source:
      "CommSec Confirmations CSV (Trade → Manage Orders → Confirmations → Download CSV). Columns as in the HairyTurtle trade-confirmation sample and the Navexa CommSec CSV guide: Confirmation Number, Order Number, Trade Date, Buy/Sell, Security, Units, Average Price ($), Brokerage (inc GST.), Net Proceeds ($), Settlement Date, Confirmation Status.",
  },
  {
    broker: "swyftx",
    source:
      "Swyftx transaction report headers listed by cryptact (grid.cryptact.com/exchanges/swyftx): Date, Event, Asset, Amount, Currency, Value, Rate, Fee Amount, Fee Asset, Transaction ID. Download steps: Swyftx Support, “Download a transaction report” (article 12004189).",
  },
  {
    broker: "easycrypto",
    source:
      "Easy Crypto order as a from-amount, from-currency, to-amount, to-currency and rate, from Easy Crypto’s portfolio tracker guide (hub.easycrypto.com/portfolio-tracker-guide) and the Order ID download discussed on Koinly’s Easy Crypto threads.",
  },
  {
    broker: "generic",
    source: "Any other readable CSV. Date, ticker, side, quantity and price are chosen on the column map. Nothing is guessed.",
  },
];

function has(headers: readonly string[], name: string): boolean {
  const wanted = normHeader(name);
  return headers.includes(wanted);
}

export function detectBroker(grid: string[][]): BrokerId | null {
  if (!grid.length) return null;
  if (isIbkrActivity(grid)) return "ibkr";
  const headers = (grid[0] || []).map(normHeader);
  if (has(headers, "instrument code") && (has(headers, "transaction type") || has(headers, "market code") || has(headers, "order id") || has(headers, "oder id"))) {
    return "sharesies";
  }
  if (has(headers, "date (nz)") && has(headers, "brokerage fees (usd)")) return "hatch";
  if (has(headers, "average price ($)") || has(headers, "brokerage (inc gst.)")) return "commsec";
  if (has(headers, "contract note") && has(headers, "security code")) return "asb";
  if (has(headers, "confirmation number") && has(headers, "brokerage") && has(headers, "exchange") && !has(headers, "confirmation status")) {
    return "jarden";
  }
  if (has(headers, "from currency") && has(headers, "to currency")) return "easycrypto";
  if (has(headers, "event") && has(headers, "asset") && has(headers, "transaction id")) return "swyftx";
  if (has(headers, "avg price") && has(headers, "units") && (has(headers, "symbol") || has(headers, "ticker"))) return "stake";
  if (has(headers, "clientaccountid") || (has(headers, "buy/sell") && (has(headers, "fxratetobase") || has(headers, "ibcommission") || has(headers, "tradeprice")))) {
    return "ibkr";
  }
  return null;
}

const DATE_NAMES = ["date", "trade date", "transaction date", "booked", "when", "created"];
const TICKER_NAMES = ["ticker", "symbol", "instrument", "code", "security", "asset"];
const SIDE_NAMES = ["side", "type", "what", "direction", "buy/sell", "action", "event"];
const QTY_NAMES = ["quantity", "qty", "units", "amount"];
const PRICE_NAMES = ["price", "unit price", "avg price", "average price", "rate"];
const FEE_NAMES = ["fee", "fees", "charge", "brokerage", "commission"];
const CCY_NAMES = ["currency", "ccy", "money code"];
const FX_NAMES = ["fx", "fx rate", "nzd per unit", "exchange rate"];

export function suggestedColumnMap(headers: readonly string[]): ColumnMap {
  const pick = (names: string[]) => headers.find((header) => names.includes(normHeader(header))) || "";
  return {
    date: pick(DATE_NAMES),
    ticker: pick(TICKER_NAMES),
    side: pick(SIDE_NAMES),
    quantity: pick(QTY_NAMES),
    price: pick(PRICE_NAMES),
    fee: pick(FEE_NAMES),
    currency: pick(CCY_NAMES),
    fx: pick(FX_NAMES),
  };
}

export function mappingReady(mapping: ColumnMap | undefined): mapping is ColumnMap {
  if (!mapping) return false;
  return Boolean(mapping.date && mapping.ticker && mapping.side && mapping.quantity && mapping.price);
}
