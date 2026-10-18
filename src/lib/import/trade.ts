import { knownImportSymbol } from "@/lib/import-symbols";
import { cashCents, centsToNumber, nzdOne, parseDecimal, productCents, scaledToNumber, toCents } from "@/lib/import/money";
import type { FxNeed, ImportCurrency, ImportRow, ImportSide, RowNote } from "@/lib/import/types";

export interface TradeParts {
  line: number;
  date: string;
  ticker: string;
  side: ImportSide;
  quantity: string;
  price: string;
  fee?: string;
  currency: ImportCurrency;
  /** NZD per 1 unit, when the file printed one. */
  fx?: string | null;
  brokerRef?: string;
  assetName?: string;
  /** File total that must equal quantity × price, to the cent. */
  value?: string | null;
  /** File total that must equal quantity × price, plus the fee on a buy and minus the fee on a sell. */
  net?: string | null;
}

export interface TradeBuild {
  row?: ImportRow;
  error?: RowNote;
  fxNeed?: FxNeed;
}

function note(line: number, message: string): RowNote {
  return { line, message: `Line ${line}: ${message}` };
}

export function marketTicker(code: string, market: string): string {
  const ticker = code.trim().toUpperCase();
  if (!ticker || /\.(NZ|AX)$/.test(ticker)) return ticker;
  const name = market.trim().toUpperCase().replace(/\s+/g, "");
  if (name === "NZX" || name === "NZ" || name === "NZSX") return `${ticker}.NZ`;
  if (name === "ASX" || name === "AX" || name === "AU" || name === "AUS") return `${ticker}.AX`;
  return ticker;
}

export function parseSide(raw: string): ImportSide | "skip" | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (["buy", "bought", "purchase", "b"].includes(text)) return "buy";
  if (["sell", "sold", "s"].includes(text)) return "sell";
  if (
    ["dividend", "div", "split", "transfer", "deposit", "withdrawal", "interest", "drp", "reward", "staking", "fee"].includes(
      text
    )
  ) {
    return "skip";
  }
  return null;
}

function absScaled(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

/** Turn a readable trade into a row, or a row error. A missing foreign rate is reported so the caller can look it up. */
export function buildTrade(parts: TradeParts, reviewedRates?: Record<string, number | null>): TradeBuild {
  const quantityRaw = parseDecimal(parts.quantity);
  if (quantityRaw != null && quantityRaw < BigInt(0) && parts.side === "buy") {
    return { error: note(parts.line, "Quantity is negative on a buy. This row was not saved.") };
  }
  const quantity = quantityRaw == null ? null : absScaled(quantityRaw);
  const price = parseDecimal(parts.price);
  if (quantity == null || quantity <= BigInt(0)) {
    return { error: note(parts.line, "Quantity must be greater than zero. This row was not saved.") };
  }
  if (price == null || price <= BigInt(0)) {
    return { error: note(parts.line, "Price could not be read. This row was not saved.") };
  }
  const ticker = parts.ticker.trim().toUpperCase();
  if (!ticker) return { error: note(parts.line, "Ticker could not be read. This row was not saved.") };
  if (!knownImportSymbol(ticker)) {
    return { error: note(parts.line, `Ticker ${ticker} is not on the symbol list. This row was not saved.`) };
  }

  const fee = absScaled(parseDecimal(parts.fee || "0") ?? BigInt(0));
  const grossCents = productCents(quantity, price);
  const feeCents = toCents(fee);

  if (parts.value != null && parts.value.trim()) {
    const printed = parseDecimal(parts.value);
    if (printed == null) return { error: note(parts.line, "Value could not be read. This row was not saved.") };
    if (toCents(absScaled(printed)) !== grossCents) {
      return { error: note(parts.line, "Value does not match quantity times price. This row was not saved.") };
    }
  }

  if (parts.net != null && parts.net.trim()) {
    const printed = parseDecimal(parts.net);
    if (printed == null) return { error: note(parts.line, "Net amount could not be read. This row was not saved.") };
    const want = parts.side === "sell" ? grossCents - feeCents : grossCents + feeCents;
    const got = toCents(absScaled(printed));
    if (got !== (want < BigInt(0) ? -want : want)) {
      return { error: note(parts.line, "Net amount does not match the price, quantity and fee. This row was not saved.") };
    }
  }

  let fx = parts.currency === "NZD" ? nzdOne() : parseDecimal(parts.fx || "");
  if (fx != null && fx < BigInt(0)) fx = -fx;
  if (parts.currency === "USD" && fx != null && fx > BigInt(0) && fx < nzdOne()) {
    fx = (nzdOne() * nzdOne()) / fx;
  }
  if (fx == null || fx <= BigInt(0)) {
    if (parts.currency !== "AUD" && parts.currency !== "USD") {
      return { error: note(parts.line, "Currency must be NZD, AUD or USD. This row was not saved.") };
    }
    const key = `${parts.currency}|${parts.date}`;
    const hasReviewed = reviewedRates != null && Object.prototype.hasOwnProperty.call(reviewedRates, key);
    if (!hasReviewed) {
      return {
        fxNeed: { currency: parts.currency, date: parts.date },
        error: note(parts.line, `No NZD rate for ${parts.currency} on ${parts.date}. No rate was guessed. This row was not saved.`),
      };
    }
    const reviewed = reviewedRates?.[key];
    const parsed = reviewed != null && reviewed > 0 ? parseDecimal(String(reviewed)) : null;
    if (parsed == null || parsed <= BigInt(0)) {
      return { error: note(parts.line, `No reviewed NZD rate for ${parts.currency} on ${parts.date}. This row was not saved.`) };
    }
    fx = parsed;
  }

  const cents = cashCents({ side: parts.side, quantity, price, fee, fx });
  return {
    row: {
      line: parts.line,
      date: parts.date,
      ticker,
      side: parts.side,
      quantity: scaledToNumber(quantity),
      price: scaledToNumber(price),
      fee: scaledToNumber(fee),
      currency: parts.currency,
      fx: scaledToNumber(fx),
      cashEffectNzd: centsToNumber(cents),
      brokerRef: (parts.brokerRef || "").trim().replace(/\s+/g, ""),
      ...(parts.assetName ? { assetName: parts.assetName } : {}),
    },
  };
}
