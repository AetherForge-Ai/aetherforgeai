/**
 * Blocks applied before a movement can be confirmed.
 * Messages are shown inline on the Record a transaction panel.
 */

import { formatDisplayDate, formatQuantity } from "@/lib/currency";
import type { RecordKind } from "@/lib/movement-preview";

export interface RecordCheck {
  type: RecordKind;
  /** yyyy-mm-dd */
  date: string;
  today: string;
  quantity: number;
  price: number;
  held: number;
  /** yyyy-mm-dd of the earliest buy, when this asset is already held. */
  firstBuyDate?: string | null;
  hasAsset: boolean;
  cashKnown: boolean;
  cashAfterNzd: number;
  /** Signed cash change. When set, only a reduction can take cash below zero. */
  cashChangeNzd?: number;
  needsCash: boolean;
}

/** A typed trade number. "abc" is not a number. "-5" is a number. */
export function parseTradeNumber(raw: string): { ok: true; value: number } | { ok: false } {
  const text = raw.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return { ok: false };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value };
}

function positiveNumberProblem(raw: string | undefined, numeric: number, zeroMessage: string): string | null {
  if (raw != null && raw.trim() !== "") {
    const parsed = parseTradeNumber(raw);
    if (!parsed.ok) return "Enter a number.";
    if (!(parsed.value > 0)) return zeroMessage;
    return null;
  }
  if (!(numeric > 0)) return zeroMessage;
  return null;
}

export function transactionProblems(input: RecordCheck & { quantityRaw?: string; priceRaw?: string }): string[] {
  const problems: string[] = [];
  if (!input.date) problems.push("Choose a date.");
  else if (input.date > input.today) problems.push("The date can't be in the future.");

  const traded = input.type === "buy" || input.type === "sell";
  const needsAsset = traded || input.type === "dividend" || (input.type === "opening_balance" && input.hasAsset);
  if (needsAsset && !input.hasAsset) {
    problems.push(
      input.type === "dividend" ? "Choose the holding this dividend belongs to." : "Choose an asset."
    );
  }
  const needsQuantity = traded || (input.type === "opening_balance" && input.hasAsset);
  if (needsQuantity) {
    const quantityProblem = positiveNumberProblem(input.quantityRaw, input.quantity, "Quantity must be greater than zero.");
    if (quantityProblem) problems.push(quantityProblem);
  }
  if (traded || (input.type === "opening_balance" && input.hasAsset)) {
    const priceProblem = positiveNumberProblem(input.priceRaw, input.price, "Price must be greater than zero.");
    if (priceProblem) problems.push(priceProblem);
  }
  const cashAmount = input.type === "deposit" || input.type === "withdraw" || input.type === "tax" || input.type === "dividend" || (input.type === "opening_balance" && !input.hasAsset);
  if (cashAmount) {
    const amountProblem = positiveNumberProblem(input.priceRaw, input.price, "Amount must be greater than zero.");
    if (amountProblem) problems.push(amountProblem);
  }

  if (input.type === "sell") {
    if (!(input.held > 0)) problems.push("You don't hold this asset, so it can't be sold.");
    else if (input.quantity > input.held + 1e-6) {
      problems.push(`You hold ${formatQuantity(input.held)}. A sell can't be larger than that.`);
    }
    if (input.firstBuyDate && input.date && input.date < input.firstBuyDate) {
      problems.push(
        `This sell is dated before the first buy of this asset (${formatDisplayDate(input.firstBuyDate)}).`
      );
    }
  }

  if (input.type === "correction") {
    const quantityProblem = positiveNumberProblem(input.quantityRaw, input.quantity, "Quantity must be greater than zero.");
    if (quantityProblem) problems.push(quantityProblem);
    const priceProblem = positiveNumberProblem(input.priceRaw, input.price, "Price must be greater than zero.");
    if (priceProblem) problems.push(priceProblem);
    if (!(input.held > 0)) {
      problems.push("A correction can only be recorded from Holding Edit on a holding you own.");
    }
  }

  if (input.type === "dividend" && input.hasAsset && !(input.held > 0)) {
    problems.push("A dividend has to be linked to a holding you already have.");
  }

  const reducesCash =
    input.cashChangeNzd == null
      ? input.type === "buy" || input.type === "withdraw" || input.type === "tax"
      : input.cashChangeNzd < -1e-6;
  // An unknown balance does not block Review. Confirm fetches it and then checks.
  if (input.cashKnown && input.cashAfterNzd < -1e-6 && reducesCash) {
    problems.push("This would take cash below zero.");
  }
  return problems;
}

/**
 * First blocking message, or null when the movement may be recorded.
 * A correction is refused unless Holding Edit asked for it on a holding this account owns.
 */
export function assessMovement(input: RecordCheck & { fromHoldingEdit?: boolean }): string | null {
  if (input.type === "correction" && !input.fromHoldingEdit) {
    return "A correction can only be recorded from Holding Edit on a holding you own.";
  }
  return transactionProblems(input)[0] ?? null;
}

/**
 * Civil day for a movement. A date-only yyyy-mm-dd is that day.
 * A timestamp is the Auckland calendar day, so UTC midnight is not the previous evening.
 */
export function movementCivilDay(raw: string | undefined | null, today: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return today;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

/** Keep the earlier civil day when a later buy is merged into an existing lot. */
export function earlierCivilDay(existing: string | null | undefined, incoming: string): string {
  const incomingDay = movementCivilDay(incoming, incoming.slice(0, 10) || "1970-01-01");
  if (!existing) return incomingDay;
  const prior = movementCivilDay(existing, incomingDay);
  return prior <= incomingDay ? prior : incomingDay;
}
