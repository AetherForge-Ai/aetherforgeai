/**
 * Unified holdings table, built only from a portfolio snapshot.
 * Filtered subtotals add the snapshot's own rounded market values.
 * The unfiltered asset-class footer is the snapshot grand total.
 */

import { formatNzd, formatUnitPrice, roundMoney, type CurrencyCode } from "@/lib/currency";
import { chainForTicker } from "@/lib/crypto-board";
import { listingExchangeLabel } from "@/lib/market-intel";
import {
  MISSING_MARK,
  type PortfolioSnapshot,
  type SnapshotCashLine,
  type SnapshotClass,
  type SnapshotFigure,
  type SnapshotLedgerLine,
  type SnapshotPosition,
  returnPercentFigure,
} from "@/lib/portfolio-snapshot";
import { blankSnapshotFigure } from "@/lib/snapshot-figure";
import { PERIOD_START_REASON, type PeriodId } from "@/lib/dashboard-kpi";

export type ColumnSetId = "summary" | "performance" | "income" | "tax" | "crypto" | "custom";
export type GroupBy = "class" | "market" | "currency" | "broker" | "sector" | "none";
export type GainFilter = "all" | "gain" | "loss";
export type OpenFilter = "open" | "closed" | "all";

export type ColumnId =
  | "asset"
  | "qty"
  | "avgCost"
  | "price"
  | "marketValue"
  | "costBase"
  | "unrealised"
  | "realised"
  | "income"
  | "currency"
  | "fees"
  | "totalReturn"
  | "weight"
  | "day"
  | "actions"
  | "week"
  | "month"
  | "ytd"
  | "periodReturn"
  | "annualised"
  | "incomeGross"
  | "withholding"
  | "incomeNet"
  | "yield"
  | "yieldOnCost"
  | "lastPaid"
  | "lots"
  | "realisedYear"
  | "fif"
  | "mktCap"
  | "vol24h"
  | "change1h"
  | "change24h"
  | "change7d"
  | "supply";

export const COLUMN_LABEL: Record<ColumnId, string> = {
  asset: "Asset",
  qty: "Qty",
  avgCost: "Avg cost",
  price: "Price",
  marketValue: "Market value",
  costBase: "Cost base",
  unrealised: "Unrealised",
  realised: "Realised",
  income: "Income",
  currency: "Currency",
  fees: "Fees",
  totalReturn: "Total return",
  weight: "Weight",
  day: "Day Δ",
  actions: "Actions",
  week: "1W",
  month: "1M",
  ytd: "YTD",
  periodReturn: "Period return",
  annualised: "% p.a.",
  incomeGross: "Gross",
  withholding: "Withholding",
  incomeNet: "Net",
  yield: "Yield",
  yieldOnCost: "Yield on cost",
  lastPaid: "Last paid",
  lots: "FIFO lots",
  realisedYear: "Realised by tax year",
  fif: "FIF opening value",
  mktCap: "Mkt cap",
  vol24h: "24h vol",
  change1h: "1h",
  change24h: "24h",
  change7d: "7d",
  supply: "Supply",
};

const SUMMARY_COLUMNS: ColumnId[] = ["asset", "qty", "price", "marketValue", "totalReturn", "weight", "actions"];

export const COLUMN_SETS: Record<Exclude<ColumnSetId, "custom">, ColumnId[]> = {
  summary: SUMMARY_COLUMNS,
  performance: ["asset", "day", "week", "month", "ytd", "periodReturn", "annualised", "actions"],
  income: ["asset", "incomeGross", "withholding", "incomeNet", "yield", "yieldOnCost", "lastPaid", "actions"],
  tax: ["asset", "lots", "realised", "realisedYear", "fif", "actions"],
  crypto: ["asset", "mktCap", "vol24h", "change1h", "change24h", "change7d", "supply", "actions"],
};

/** Columns a member can add. Asset stays pinned and is not in this list. */
export const CUSTOM_COLUMN_CHOICES: ColumnId[] = [
  "qty",
  "price",
  "marketValue",
  "totalReturn",
  "weight",
  "avgCost",
  "costBase",
  "unrealised",
  "realised",
  "income",
  "currency",
  "fees",
  "day",
];

export const CASH_COLUMN_REASON = "This column does not apply to cash.";

const COLUMN_SET_IDS = new Set<string>(["summary", "performance", "income", "tax", "crypto", "custom"]);
const GROUP_IDS = new Set<string>(["class", "market", "currency", "broker", "sector", "none"]);
const CLASS_IDS = new Set<string>(["all", "shares", "crypto", "metals", "cash"]);

export function isColumnSetId(value: string | null | undefined): value is ColumnSetId {
  return Boolean(value && COLUMN_SET_IDS.has(value));
}

export function columnsFor(set: ColumnSetId, custom: readonly ColumnId[]): ColumnId[] {
  if (set !== "custom") return COLUMN_SETS[set];
  const picked = custom.filter((id) => id !== "asset" && id !== "actions" && id in COLUMN_LABEL);
  return ["asset", ...picked, "actions"];
}

export interface HoldingsQuery {
  q: string;
  assetClass: SnapshotClass | "all";
  market: string;
  currency: string;
  gain: GainFilter;
  open: OpenFilter;
  groupBy: GroupBy;
  sortKey: ColumnId;
  sortDir: "asc" | "desc";
}

export const DEFAULT_HOLDINGS_QUERY: HoldingsQuery = {
  q: "",
  assetClass: "all",
  market: "",
  currency: "",
  gain: "all",
  open: "all",
  groupBy: "class",
  sortKey: "marketValue",
  sortDir: "desc",
};

export interface TableCellModel {
  figures: SnapshotFigure[];
  text: string | null;
  badge: { label: string; reason: string | null } | null;
}

export interface HoldingsRowModel {
  id: string;
  kind: "position" | "cash";
  ticker: string;
  name: string;
  assetClass: SnapshotClass;
  classLabel: string;
  exchange: string;
  currency: string;
  closed: boolean;
  negativeCash: boolean;
  marketValue: SnapshotFigure;
  cells: Partial<Record<ColumnId, TableCellModel>>;
  position: SnapshotPosition | null;
  cash: SnapshotCashLine | null;
  ledger: SnapshotLedgerLine[];
  dividends: SnapshotLedgerLine[];
  /** Snapshot position id when one holding is known. Cash has none. */
  holdingId: string | null;
}

export interface HoldingsGroupModel {
  id: string;
  label: string;
  subtotal: SnapshotFigure;
  rows: HoldingsRowModel[];
  emptyLabel: string | null;
}

export interface HoldingsTableModel {
  columns: ColumnId[];
  groups: HoldingsGroupModel[];
  grand: SnapshotFigure;
  grandLabel: "Grand total" | "Visible total";
  filteredNote: string | null;
  reconciliationLabel: string;
  markets: string[];
  currencies: string[];
  matchesFullBook: boolean;
}

const CLASS_PILL: Record<SnapshotClass, string> = {
  shares: "Shares",
  crypto: "Crypto",
  metals: "Metals",
  cash: "Cash",
};

const CLASS_EMPTY: Record<SnapshotClass, string> = {
  shares: "No shares yet",
  crypto: "No crypto yet",
  metals: "No metals yet",
  cash: "No cash yet",
};

export function holdingsFilterChoices(snapshot: PortfolioSnapshot): { markets: string[]; currencies: string[] } {
  const markets = new Set<string>();
  const currencies = new Set<string>();
  for (const group of snapshot.groups) {
    for (const position of group.positions) {
      markets.add(exchangeOf(position));
      currencies.add(position.currency);
    }
  }
  for (const line of snapshot.cashLines) currencies.add(line.currency);
  markets.add("Cash");
  return {
    markets: [...markets].sort((a, b) => a.localeCompare(b)),
    currencies: [...currencies].sort((a, b) => a.localeCompare(b)),
  };
}

export function readHoldingsQuery(params: URLSearchParams): Pick<
  HoldingsQuery,
  "q" | "assetClass" | "market" | "currency" | "gain" | "open" | "groupBy" | "sortKey" | "sortDir"
> & { columnSet: ColumnSetId; customColumns: ColumnId[] } {
  const assetClass = params.get("hclass") || params.get("view");
  const gain = params.get("hgain");
  const open = params.get("hopen");
  const groupBy = params.get("hgroup");
  const sortKey = params.get("hsort");
  const sortDir = params.get("hdir");
  const columnSet = params.get("hcols");
  const custom = (params.get("hcustom") || "")
    .split(",")
    .filter((id): id is ColumnId => id in COLUMN_LABEL);
  return {
    q: params.get("hq") || "",
    assetClass: assetClass && CLASS_IDS.has(assetClass) ? (assetClass as SnapshotClass | "all") : "all",
    market: params.get("hmarket") || "",
    currency: params.get("hcurrency") || "",
    gain: gain === "gain" || gain === "loss" ? gain : "all",
    open: open === "open" || open === "closed" ? open : "all",
    groupBy: groupBy && GROUP_IDS.has(groupBy) ? (groupBy as GroupBy) : "class",
    sortKey: sortKey && sortKey in COLUMN_LABEL ? (sortKey as ColumnId) : "marketValue",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    columnSet: isColumnSetId(columnSet) ? columnSet : "summary",
    customColumns: custom,
  };
}

export function writeHoldingsQuery(
  params: URLSearchParams,
  query: HoldingsQuery,
  columnSet: ColumnSetId,
  customColumns: readonly ColumnId[]
): void {
  setParam(params, "hq", query.q.trim(), "");
  setParam(params, "hclass", query.assetClass, "all");
  setParam(params, "hmarket", query.market, "");
  setParam(params, "hcurrency", query.currency, "");
  setParam(params, "hgain", query.gain, "all");
  setParam(params, "hopen", query.open, "all");
  setParam(params, "hgroup", query.groupBy, "class");
  setParam(params, "hsort", query.sortKey, "marketValue");
  setParam(params, "hdir", query.sortDir, "desc");
  setParam(params, "hcols", columnSet, "summary");
  setParam(params, "hcustom", columnSet === "custom" ? customColumns.join(",") : "", "");
}

export function buildHoldingsTable(
  snapshot: PortfolioSnapshot,
  query: HoldingsQuery,
  columns: readonly ColumnId[],
  period: PeriodId = "all"
): HoldingsTableModel {
  const choices = holdingsFilterChoices(snapshot);
  const rows = allRows(snapshot, period).filter((row) => matches(row, query));
  const filtered = isFiltered(query);
  const groups = groupRows(snapshot, rows, query, filtered);
  const visible = groups.reduce((total, group) => total + group.rows.length, 0);
  const universe = allRows(snapshot, period).length;
  const grand = filtered ? visibleGrand(snapshot, groups) : snapshot.grand;
  return {
    columns: [...columns],
    groups,
    grand,
    grandLabel: filtered ? "Visible total" : "Grand total",
    filteredNote: filtered ? `Filtered: ${visible} of ${universe}` : null,
    reconciliationLabel: snapshot.reconciliation.label,
    markets: choices.markets,
    currencies: choices.currencies,
    matchesFullBook: !filtered && grand.value != null && grand.value === snapshot.kpis.netWorth.value,
  };
}

function allRows(snapshot: PortfolioSnapshot, period: PeriodId): HoldingsRowModel[] {
  const rows: HoldingsRowModel[] = [];
  for (const group of snapshot.groups) {
    if (group.id === "cash") continue;
    for (const position of group.positions) {
      rows.push(positionRow(snapshot, position, period));
    }
  }
  for (const line of snapshot.cashLines) rows.push(cashRow(snapshot, line));
  return rows;
}

function isFiltered(query: HoldingsQuery): boolean {
  return Boolean(
    query.q.trim() ||
      (query.assetClass && query.assetClass !== "all") ||
      query.market ||
      query.currency ||
      query.gain !== "all" ||
      query.open !== "all"
  );
}

function matches(row: HoldingsRowModel, query: HoldingsQuery): boolean {
  if (query.assetClass !== "all" && row.assetClass !== query.assetClass) return false;
  if (query.market && row.exchange !== query.market) return false;
  if (query.currency && row.currency !== query.currency) return false;
  if (query.open === "open" && row.closed) return false;
  if (query.open === "closed" && !row.closed) return false;
  if (query.gain !== "all") {
    const probe = row.closed ? row.position?.realised.value : row.kind === "cash" ? row.cash?.fxGainNzd : row.position?.unrealised.value;
    if (probe == null || probe === 0) return false;
    if (query.gain === "gain" && probe < 0) return false;
    if (query.gain === "loss" && probe > 0) return false;
  }
  const needle = query.q.trim().toLowerCase();
  if (!needle) return true;
  return `${row.name} ${row.ticker} ${row.currency}`.toLowerCase().includes(needle);
}

function groupRows(
  snapshot: PortfolioSnapshot,
  rows: HoldingsRowModel[],
  query: HoldingsQuery,
  filtered: boolean
): HoldingsGroupModel[] {
  if (query.groupBy === "class" && !filtered) {
    return snapshot.groups.map((group) => {
      const members = sortRows(
        rows.filter((row) => row.assetClass === group.id),
        query.sortKey,
        query.sortDir
      );
      return {
        id: group.id,
        label: group.label,
        subtotal: group.marketValue,
        rows: members,
        emptyLabel: members.length ? null : CLASS_EMPTY[group.id],
      };
    });
  }

  if (query.groupBy === "class" && query.assetClass !== "all" && onlyClassFilter(query)) {
    const group = snapshot.groups.find((item) => item.id === query.assetClass);
    const members = sortRows(rows, query.sortKey, query.sortDir);
    if (!group) return [];
    return [
      {
        id: group.id,
        label: group.label,
        subtotal: group.marketValue,
        rows: members,
        emptyLabel: members.length ? null : CLASS_EMPTY[group.id],
      },
    ];
  }

  const buckets = new Map<string, { label: string; rows: HoldingsRowModel[] }>();
  const put = (id: string, label: string, row: HoldingsRowModel) => {
    const bucket = buckets.get(id) || { label, rows: [] };
    bucket.rows.push(row);
    buckets.set(id, bucket);
  };
  for (const row of rows) {
    if (query.groupBy === "class") put(row.assetClass, classGroupLabel(snapshot, row.assetClass), row);
    else if (query.groupBy === "market") put(row.exchange, row.exchange, row);
    else if (query.groupBy === "currency") put(row.currency, row.currency, row);
    else if (query.groupBy === "broker") put("missing-broker", "Broker was not stored", row);
    else if (query.groupBy === "sector") put("missing-sector", "Sector was not stored", row);
    else put("all", "All", row);
  }

  const ordered =
    query.groupBy === "class"
      ? snapshot.groups
          .filter((group) => buckets.has(group.id))
          .map((group) => [group.id, buckets.get(group.id)!] as const)
      : [...buckets.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));

  return ordered.map(([id, bucket]) => {
    const members = sortRows(bucket.rows, query.sortKey, query.sortDir);
    return {
      id,
      label: bucket.label,
      subtotal: sumMarketValues(snapshot, members, `${bucket.label} is the market value of the visible rows.`),
      rows: members,
      emptyLabel: members.length ? null : "No holdings match these filters.",
    };
  });
}

function onlyClassFilter(query: HoldingsQuery): boolean {
  return !query.q.trim() && !query.market && !query.currency && query.gain === "all" && query.open === "all";
}

function classGroupLabel(snapshot: PortfolioSnapshot, id: SnapshotClass): string {
  return snapshot.groups.find((group) => group.id === id)?.label || CLASS_PILL[id];
}

function visibleGrand(snapshot: PortfolioSnapshot, groups: HoldingsGroupModel[]): SnapshotFigure {
  if (!groups.length) {
    return blankSnapshotFigure(
      "The visible total adds the market values of the rows that match the filters.",
      "No rows match these filters.",
      snapshot.source,
      snapshot.asOfLabel
    );
  }
  return sumMarketValues(snapshot, groups.flatMap((group) => group.rows), "The visible total adds the market values of the rows that match the filters.");
}

function sumMarketValues(snapshot: PortfolioSnapshot, rows: HoldingsRowModel[], formula: string): SnapshotFigure {
  const figures = rows.map((row) => row.marketValue);
  const missing = figures.find((figure) => figure.value == null);
  if (missing) {
    return blankSnapshotFigure(formula, missing.reason || "A price is missing.", snapshot.source, snapshot.asOfLabel);
  }
  const total = roundMoney(figures.reduce((sum, figure) => sum + (figure.value || 0), 0));
  if (snapshot.grand.value != null && total === snapshot.grand.value) return snapshot.grand;
  return {
    value: total,
    display: formatNzd(total),
    reason: null,
    maths: {
      formula,
      inputs: figures.map((figure) => figure.display),
      arithmetic: formatNzd(total),
      source: snapshot.source,
      asOf: snapshot.asOfLabel,
    },
  };
}

function sortRows(rows: HoldingsRowModel[], key: ColumnId, dir: "asc" | "desc"): HoldingsRowModel[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const cmp = compareSort(a.row, b.row, key);
    if (cmp === 0) return a.index - b.index;
    return dir === "asc" ? cmp : -cmp;
  });
  return indexed.map((item) => item.row);
}

function compareSort(a: HoldingsRowModel, b: HoldingsRowModel, key: ColumnId): number {
  if (key === "asset") return a.ticker.localeCompare(b.ticker);
  const av = sortNumber(a, key);
  const bv = sortNumber(b, key);
  if (av == null && bv == null) return a.ticker.localeCompare(b.ticker);
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

function sortNumber(row: HoldingsRowModel, key: ColumnId): number | null {
  if (key === "qty") return row.kind === "cash" ? row.cash?.amountLocal ?? null : row.position?.quantity ?? null;
  if (key === "avgCost") return row.position?.averageCostLocal ?? null;
  if (key === "price") return row.kind === "cash" ? row.cash?.fx ?? null : row.position?.marketPriceLocal ?? null;
  if (key === "marketValue") return row.marketValue.value;
  if (key === "weight") return row.position?.weight.value ?? null;
  const figure = row.cells[key]?.figures[0];
  return figure ? figure.value : null;
}

function positionRow(snapshot: PortfolioSnapshot, position: SnapshotPosition, period: PeriodId): HoldingsRowModel {
  const ledger = snapshot.ledger.filter((line) => line.ticker === position.ticker);
  const marketValue = position.marketValue;
  const row: HoldingsRowModel = {
    id: `${position.assetClass}:${position.ticker}`,
    kind: "position",
    ticker: position.ticker,
    name: position.name || position.ticker,
    assetClass: position.assetClass,
    classLabel: CLASS_PILL[position.assetClass],
    exchange: distinctChip(exchangeOf(position), CLASS_PILL[position.assetClass]),
    currency: position.currency,
    closed: position.closed || position.quantity <= 1e-9,
    negativeCash: false,
    marketValue,
    cells: {},
    position,
    cash: null,
    ledger,
    dividends: ledger.filter((line) => line.type === "dividend" || line.type === "interest"),
    holdingId: position.holdingId ?? null,
  };
  row.cells = cellsForPosition(snapshot, position, period);
  return row;
}

const CASH_MOVEMENT = new Set([
  "deposit",
  "withdraw",
  "withdrawal",
  "opening_balance",
  "buy",
  "sell",
  "dividend",
  "interest",
  "fee",
  "tax",
]);

/** Deposits, withdrawals, and trade settlements that moved this cash balance. */
export function ledgerForCash(snapshot: PortfolioSnapshot, currency: string): PortfolioSnapshot["ledger"] {
  const code = currency.toUpperCase();
  return snapshot.ledger.filter((line) => {
    const type = line.type.toLowerCase();
    if (!CASH_MOVEMENT.has(type)) return false;
    if (type === "opening_balance" && line.ticker) return false;
    const lineCode = (line.currency || "NZD").toUpperCase();
    if (lineCode === code) return true;
    return code === "NZD" && line.cashNzd !== 0;
  });
}

function cashRow(snapshot: PortfolioSnapshot, line: SnapshotCashLine): HoldingsRowModel {
  const marketValue = cashValueFigure(line, snapshot.asOfLabel);
  const row: HoldingsRowModel = {
    id: `cash:${line.currency}`,
    kind: "cash",
    ticker: line.currency,
    name: "Cash",
    assetClass: "cash",
    classLabel: "Cash",
    exchange: line.currency,
    currency: line.currency,
    closed: false,
    negativeCash: line.negative,
    marketValue,
    cells: {},
    position: null,
    cash: line,
    ledger: ledgerForCash(snapshot, line.currency),
    dividends: [],
    holdingId: null,
  };
  row.cells = cellsForCash(snapshot, line, marketValue);
  return row;
}

function cellsForPosition(snapshot: PortfolioSnapshot, position: SnapshotPosition, period: PeriodId): HoldingsRowModel["cells"] {
  const asOf = snapshot.asOfLabel;
  const day = blankSnapshotFigure(
    "Day change is the price now minus the previous close.",
    "No previous close was stored for this holding.",
    position.priceSource || snapshot.source,
    position.priceAsOf || asOf
  );
  const periodReturn =
    period === "all"
      ? position.totalReturn
      : blankSnapshotFigure("Period return needs the market value at the start of the period.", PERIOD_START_REASON, snapshot.source, asOf);
  const notOnRow = (formula: string, reason: string) => blankSnapshotFigure(formula, reason, snapshot.source, asOf);
  const sourceBlank = (formula: string) => blankSnapshotFigure(formula, "source has no data", position.priceSource || snapshot.source, position.priceAsOf || asOf);
  return {
    qty: textCell(formatQty(position.quantity), "Open quantity on this snapshot.", [`${position.ticker} ${formatQty(position.quantity)}`], snapshot),
    avgCost: localPriceCell(position.averageCostLocal, position.currency, "Average cost is the open lots' prices in their own currency.", position.lots.map((lot) => `${lot.acquiredLabel}: ${lot.quantity} × ${lot.priceLocal}`), "Average cost was not stored.", snapshot),
    price: {
      figures: [
        localPriceCell(
          position.marketPriceLocal,
          position.currency,
          "Price is the mark on this snapshot, in the holding's own currency.",
          [position.priceSource || "No price source was stored."],
          position.marketValue.reason || "No price was stored for this holding.",
          snapshot
        ).figures[0],
      ],
      text: null,
      badge: {
        label: position.priceSource || MISSING_MARK,
        reason: position.priceAsOf ? `As of ${position.priceAsOf}` : "No quote time was stored.",
      },
    },
    marketValue: figureCell(position.marketValue),
    costBase: figureCell(position.costBase),
    unrealised: {
      figures: [
        position.unrealised,
        returnPercentFigure(position.unrealised, position.costBase, "Unrealised percent is unrealised divided by cost base.", snapshot.source, asOf),
      ],
      text: null,
      badge: null,
    },
    realised: figureCell(position.realised),
    income: figureCell(position.income),
    currency: figureCell(position.currencyEffect),
    fees: figureCell(position.fees),
    totalReturn: {
      figures: [
        position.totalReturn,
        returnPercentFigure(position.totalReturn, position.costBase, "Total return percent is total return divided by the cost base.", snapshot.source, asOf),
      ],
      text: null,
      badge: null,
    },
    weight: figureCell(position.weight),
    day: figureCell(day),
    week: figureCell(notOnRow("One-week change needs a price from a week ago.", "No price from a week ago was stored.")),
    month: figureCell(notOnRow("One-month change needs a price from a month ago.", "No price from a month ago was stored.")),
    ytd: figureCell(notOnRow("Year-to-date change needs the price on the first trading day of the year.", "No year-opening price was stored.")),
    periodReturn: figureCell(periodReturn),
    annualised: figureCell(notOnRow("Per year on a row needs a money-weighted return for that holding.", "Per-year return is not stored on this row.")),
    incomeGross: figureCell(position.incomeGross),
    withholding: figureCell(position.incomeWithholding),
    incomeNet: figureCell(position.income),
    yield: figureCell(notOnRow("Yield is net income divided by market value.", "Yield was not stored.")),
    yieldOnCost: figureCell(notOnRow("Yield on cost is net income divided by cost base.", "Yield on cost was not stored.")),
    lastPaid: figureCell(notOnRow("Last paid is the date of the latest dividend.", "No payment date was stored.")),
    lots: textCell(
      position.lots.length ? `${position.lots.length} open lot${position.lots.length === 1 ? "" : "s"}` : "No open lots",
      "FIFO lots are the open lots on this snapshot, oldest first.",
      position.lots.map((lot) => `${lot.acquiredLabel}: ${lot.quantity} × ${lot.priceLocal} × ${lot.fxDisplay}`),
      snapshot
    ),
    realisedYear: figureCell(notOnRow("Realised by tax year groups closed sales by the New Zealand tax year.", "Realised by tax year is not on this snapshot.")),
    fif: figureCell(notOnRow("FIF opening value is the opening market value for the tax year.", "FIF opening value is not on this snapshot.")),
    mktCap: figureCell(sourceBlank("Market cap is the coin's market value from the price source.")),
    vol24h: figureCell(sourceBlank("24 hour volume comes from the price source.")),
    change1h: figureCell(sourceBlank("The 1 hour change comes from the price source.")),
    change24h: figureCell(sourceBlank("The 24 hour change comes from the price source.")),
    change7d: figureCell(sourceBlank("The 7 day change comes from the price source.")),
    supply: figureCell(sourceBlank("Circulating supply comes from the price source.")),
  };
}

function cellsForCash(snapshot: PortfolioSnapshot, line: SnapshotCashLine, marketValue: SnapshotFigure): HoldingsRowModel["cells"] {
  const asOf = snapshot.asOfLabel;
  const blank = (formula: string) => blankSnapshotFigure(formula, CASH_COLUMN_REASON, "Ledger", asOf);
  const na = (formula: string) => figureCell(blank(formula));
  const fxGain =
    line.fxGainNzd == null
      ? blankSnapshotFigure(
          "Exchange-rate gain on foreign cash is the balance times (the rate now minus the rate it was booked at).",
          "Foreign cash has no exchange rate, so its exchange-rate gain is blank.",
          "Ledger",
          asOf
        )
      : {
          value: roundMoney(line.fxGainNzd),
          display: formatNzd(line.fxGainNzd),
          reason: null,
          maths: {
            formula: "Exchange-rate gain on this cash is the balance times (the rate now minus the rate it was booked at).",
            inputs: [`${line.currency} ${line.amountLocal}`, `Rate ${line.fxDisplay}`],
            arithmetic: formatNzd(line.fxGainNzd),
            source: "Ledger",
            asOf,
          },
        };
  return {
    qty: textCell(formatQty(line.amountLocal), "Balance in this currency, from the cash ledger.", [`${line.currency} ${formatQty(line.amountLocal)}`], snapshot),
    avgCost: na("Cash has no average cost."),
    price: textCell(line.fxDisplay, "The exchange rate is NZ$ per 1 unit of this currency.", [`${line.currency} ${line.fxDisplay}`], snapshot),
    marketValue: figureCell(marketValue),
    costBase: na("Cash has no cost base."),
    unrealised: na("Cash has no unrealised price change."),
    realised: na("Cash has no realised sale."),
    income: na("Income on cash is recorded as interest on the ledger, not on this currency row."),
    currency: figureCell(fxGain),
    fees: na("Fees sit on the trades, not on the cash row."),
    totalReturn: na("Total return is not a cash balance."),
    weight: na("Weight is not stored on a cash row."),
    day: na("Day change is not stored on a cash row."),
    week: na("One-week change is not stored on a cash row."),
    month: na("One-month change is not stored on a cash row."),
    ytd: na("Year-to-date change is not stored on a cash row."),
    periodReturn: na("Period return is not stored on a cash row."),
    annualised: na("Per-year return is not stored on a cash row."),
    incomeGross: na("Gross income is not stored on a cash row."),
    withholding: na("Withholding is not stored on a cash row."),
    incomeNet: na("Net income is not stored on a cash row."),
    yield: na("Yield does not apply to cash."),
    yieldOnCost: na("Yield on cost does not apply to cash."),
    lastPaid: na("Cash has no dividend date."),
    lots: textCell("No open lots", "Cash is a balance, not a FIFO lot.", [], snapshot),
    realisedYear: na("Realised by tax year does not apply to cash."),
    fif: na("FIF opening value does not apply to cash."),
    mktCap: figureCell(blankSnapshotFigure("Market cap does not apply to cash.", "source has no data", "Ledger", asOf)),
    vol24h: figureCell(blankSnapshotFigure("Volume does not apply to cash.", "source has no data", "Ledger", asOf)),
    change1h: figureCell(blankSnapshotFigure("The 1 hour change does not apply to cash.", "source has no data", "Ledger", asOf)),
    change24h: figureCell(blankSnapshotFigure("The 24 hour change does not apply to cash.", "source has no data", "Ledger", asOf)),
    change7d: figureCell(blankSnapshotFigure("The 7 day change does not apply to cash.", "source has no data", "Ledger", asOf)),
    supply: figureCell(blankSnapshotFigure("Supply does not apply to cash.", "source has no data", "Ledger", asOf)),
  };
}

function cashValueFigure(line: SnapshotCashLine, asOf: string): SnapshotFigure {
  if (line.valueNzd == null) {
    return blankSnapshotFigure(
      "This currency's NZ$ value is the balance times the exchange rate now.",
      "Foreign cash has no exchange rate, so its NZ$ value is blank.",
      "Ledger",
      asOf
    );
  }
  const value = roundMoney(line.valueNzd);
  return {
    value,
    display: formatNzd(value),
    reason: line.negative ? "Cash is below zero. It is shown as it is, not raised to zero." : null,
    maths: {
      formula: "This currency's NZ$ value is the balance times the exchange rate now.",
      inputs: [`${line.currency} ${line.amountLocal}`, `Rate ${line.fxDisplay}`],
      arithmetic: `${line.amountLocal} × ${line.fxDisplay}`,
      source: "Ledger",
      asOf,
    },
  };
}

function figureCell(figure: SnapshotFigure): TableCellModel {
  return { figures: [figure], text: null, badge: null };
}

function textCell(text: string, formula: string, inputs: string[], snapshot: PortfolioSnapshot): TableCellModel {
  return {
    figures: [
      {
        value: null,
        display: text || MISSING_MARK,
        reason: text ? null : "This value was not stored.",
        maths: {
          formula,
          inputs: inputs.length ? inputs : [text || "This value was not stored."],
          arithmetic: text || MISSING_MARK,
          source: "Ledger",
          asOf: snapshot.asOfLabel,
        },
      },
    ],
    text,
    badge: null,
  };
}

function localPriceCell(
  value: number | null,
  currency: string,
  formula: string,
  inputs: string[],
  missingReason: string,
  snapshot: PortfolioSnapshot
): TableCellModel {
  if (value == null) {
    return figureCell(blankSnapshotFigure(formula, missingReason, snapshot.source, snapshot.asOfLabel));
  }
  const code: CurrencyCode = currency === "AUD" || currency === "NZD" || currency === "USD" ? currency : "USD";
  const display = formatUnitPrice(value, code);
  return {
    figures: [
      {
        value: null,
        display,
        reason: null,
        maths: {
          formula,
          inputs: inputs.length ? inputs : [display],
          arithmetic: display,
          source: snapshot.source,
          asOf: snapshot.asOfLabel,
        },
      },
    ],
    text: display,
    badge: null,
  };
}

/** A second chip that repeats the class pill ("Crypto Crypto", "Metals Metals") is dropped. */
export function distinctChip(chip: string, classLabel: string): string {
  return chip.trim().toLowerCase() === String(classLabel || "").trim().toLowerCase() ? "" : chip;
}

function exchangeOf(position: SnapshotPosition): string {
  if (position.assetClass === "crypto") {
    const chain = chainForTicker(position.ticker);
    return chain && chain.toLowerCase() !== "crypto" ? chain : "";
  }
  if (position.assetClass === "metals") return "Metals";
  return listingExchangeLabel(position.ticker, "stock");
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return MISSING_MARK;
  return new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 4 }).format(value);
}

function setParam(params: URLSearchParams, key: string, value: string, fallback: string): void {
  if (!value || value === fallback) params.delete(key);
  else params.set(key, value);
}

export function isSortableColumn(id: ColumnId): boolean {
  return id !== "actions";
}
