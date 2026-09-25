/**
 * Which persisted price alerts a hub desk should list.
 *
 * Create can target a name the member follows before they buy it. Those alerts
 * stay on the matching desk. A flat position (a row still in the book at dust,
 * or a linked holding that was deleted on a full sell) leaves the Watching
 * list. An unknown book (holdings not loaded, or the holdings query failed)
 * must not blank the desk.
 */

import { positionIsClosed } from "@/lib/alert-lifecycle";

export type AlertAsset = "stock" | "crypto" | "metal";

export interface DeskAlert {
  ticker: string;
  status?: string | null;
  assetType?: unknown;
  stockId?: string | null;
}

export interface DeskHolding {
  _id?: string | null;
  ticker?: string | null;
  shares?: number | null;
  asset_type?: string | null;
}

function asAssetString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.value === "string") return rec.value;
    if (typeof rec.name === "string") return rec.name;
    if (typeof rec.label === "string") return rec.label;
  }
  return "";
}

/** Map stored asset labels, including plural / metals-key drift, onto the three desks. */
export function coerceAlertAsset(value: unknown): AlertAsset | null {
  const s = asAssetString(value).trim().toLowerCase();
  if (s === "stock" || s === "stocks" || s === "equity" || s === "equities") return "stock";
  if (s === "crypto" || s === "cryptocurrency" || s === "coin" || s === "coins") return "crypto";
  if (s === "metal" || s === "metals" || s === "bullion" || s === "precious_metal") return "metal";
  return null;
}

/** Compare BHP with BHP.AX / BHP.NZ without collapsing unrelated US symbols. */
export function alertTickerKey(ticker: string | null | undefined): string {
  return String(ticker || "")
    .trim()
    .toUpperCase()
    .replace(/\.(NZ|AX|L)$/i, "");
}

export function inferAlertAssetType(
  ticker: string,
  stored: unknown,
  holdingType: unknown,
  cryptoTickers?: ReadonlySet<string>
): AlertAsset {
  const storedType = coerceAlertAsset(stored);
  if (storedType) return storedType;
  const held = coerceAlertAsset(holdingType);
  if (held) return held;
  const t = String(ticker || "").trim().toUpperCase();
  if (t === "GOLD" || t === "SILVER" || t === "XAU" || t === "XAG" || t === "XAUUSD" || t === "XAGUSD") {
    return "metal";
  }
  const bare = t.replace(/-USD$/, "");
  if (cryptoTickers?.has(t) || cryptoTickers?.has(bare)) return "crypto";
  return "stock";
}

function holdingRows(holdings: DeskHolding[], ticker: string): DeskHolding[] {
  const key = alertTickerKey(ticker);
  if (!key) return [];
  return holdings.filter((row) => alertTickerKey(row.ticker) === key);
}

function holdingAssetFor(holdings: DeskHolding[] | null, ticker: string): string | null {
  if (!holdings) return null;
  const row = holdingRows(holdings, ticker).find((h) => coerceAlertAsset(h.asset_type));
  return row?.asset_type ?? null;
}

/**
 * True when this alert should appear in the unscoped list (before a desk filter).
 * `holdings === null` means the book is unknown — keep the alert.
 */
export function alertVisibleInBook(alert: DeskAlert, holdings: DeskHolding[] | null): boolean {
  if (String(alert.status || "active").toLowerCase() === "archived") return false;
  if (holdings == null) return true;
  const rows = holdingRows(holdings, alert.ticker);
  const quantity = rows.reduce((sum, row) => {
    const shares = Number(row.shares);
    return shares > 0 ? sum + shares : sum;
  }, 0);
  if (rows.length > 0 && !positionIsClosed(quantity)) return true;
  if (rows.length > 0 && positionIsClosed(quantity)) return false;
  const linked = String(alert.stockId || "").trim();
  if (linked) {
    const linkedRow = holdings.find((row) => String(row._id || "") === linked);
    if (!linkedRow) return false;
    return !positionIsClosed(Number(linkedRow.shares) || 0);
  }
  return true;
}

export function alertListedOnDesk(
  alert: DeskAlert,
  desk: AlertAsset,
  holdings: DeskHolding[] | null,
  cryptoTickers?: ReadonlySet<string>
): boolean {
  if (!alertVisibleInBook(alert, holdings)) return false;
  const asset = inferAlertAssetType(
    alert.ticker,
    alert.assetType,
    holdingAssetFor(holdings, alert.ticker),
    cryptoTickers
  );
  return asset === desk;
}

export function alertsForDesk<T extends DeskAlert>(
  alerts: T[],
  desk: AlertAsset,
  holdings: DeskHolding[] | null,
  cryptoTickers?: ReadonlySet<string>
): T[] {
  return alerts.filter((alert) => alertListedOnDesk(alert, desk, holdings, cryptoTickers));
}
