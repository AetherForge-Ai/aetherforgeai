/** H-10 broker CSV import. Rows are trades the paper book can save. */

export type BrokerId =
  | "sharesies"
  | "hatch"
  | "ibkr"
  | "stake"
  | "asb"
  | "jarden"
  | "commsec"
  | "swyftx"
  | "easycrypto"
  | "generic";

export type ImportSide = "buy" | "sell";
export type ImportCurrency = "NZD" | "AUD" | "USD";

export interface ColumnMap {
  date: string;
  ticker: string;
  side: string;
  quantity: string;
  price: string;
  fee?: string;
  currency?: string;
  fx?: string;
}

export interface ImportRow {
  line: number;
  date: string;
  ticker: string;
  side: ImportSide;
  quantity: number;
  price: number;
  fee: number;
  currency: ImportCurrency;
  /** NZD per 1 unit of the trade currency. NZD trades are 1. */
  fx: number;
  /** NZ$ cash movement. A buy is negative. A sell is the proceeds after the fee. */
  cashEffectNzd: number;
  brokerRef: string;
  assetName?: string;
}

export interface RowNote {
  line: number;
  message: string;
}

export interface FxNeed {
  currency: "AUD" | "USD";
  date: string;
}

export interface ImportPreview {
  broker: BrokerId | null;
  label: string;
  error: string | null;
  headers: string[];
  needsMapping: boolean;
  unreadable: boolean;
  rows: ImportRow[];
  /** Rows that will be saved. Duplicates inside the file are left out. */
  toWrite: ImportRow[];
  /** Bad trade rows. Good rows in `toWrite` are still saved. */
  errors: RowNote[];
  /** Dividends, deposits, and other rows that are not trades. */
  skipped: RowNote[];
  fxNeeds: FxNeed[];
  /** Sum of NZ$ cash effects of the rows that will be saved. */
  cashNzd: number;
  fileHash: string | null;
}

export interface PlanOptions {
  mapping?: ColumnMap;
  /** Reviewed NZD per 1 unit, keyed `AUD|YYYY-MM-DD` or `USD|YYYY-MM-DD`. */
  reviewedRates?: Record<string, number | null>;
  /** Quantity already on the book, so a sell of shares that are not held is a row error. */
  held?: Record<string, number>;
}

export interface PaperBook {
  cashNzd: number;
  holdings: Record<string, number>;
  fileHashes: string[];
  batches: ImportBatch[];
}

export interface ImportBatch {
  id: string;
  fileHash: string;
  cashDeltaNzd: number;
  holdingDeltas: Record<string, number>;
}

export interface CommitOutcome {
  ok: boolean;
  error: string | null;
  duplicate: boolean;
  preview: ImportPreview;
  batchId: string | null;
  written: number;
}
