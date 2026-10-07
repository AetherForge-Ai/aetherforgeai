/**
 * Blocks applied before a movement can be confirmed.
 * Messages are shown inline on the Record a transaction panel.
 */

import { formatDisplayDate } from "@/lib/currency";
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

export function transactionProblems(input: RecordCheck): string[] {
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
  if ((traded || (input.type === "opening_balance" && input.hasAsset)) && !(input.quantity > 0)) {
    problems.push("Quantity must be greater than zero.");
  }
  if ((traded || (input.type === "opening_balance" && input.hasAsset)) && !(input.price > 0)) {
    problems.push("Price must be greater than zero.");
  }
  const cashAmount = input.type === "deposit" || input.type === "withdraw" || input.type === "tax" || input.type === "dividend" || (input.type === "opening_balance" && !input.hasAsset);
  if (cashAmount && !(input.price > 0)) problems.push("Amount must be greater than zero.");

  if (input.type === "sell") {
    if (!(input.held > 0)) problems.push("You don't hold this asset, so it can't be sold.");
    else if (input.quantity > input.held + 1e-6) {
      problems.push(`You hold ${trimQty(input.held)}. A sell can't be larger than that.`);
    }
    if (input.firstBuyDate && input.date && input.date < input.firstBuyDate) {
      problems.push(
        `This sell is dated before the first buy of this asset (${formatDisplayDate(input.firstBuyDate)}).`
      );
    }
  }

  if (input.type === "correction") {
    if (!(input.quantity > 0)) problems.push("Quantity must be greater than zero.");
    if (!(input.price > 0)) problems.push("Price must be greater than zero.");
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
  if (input.needsCash && !input.cashKnown) {
    problems.push("Cash is still loading. Wait until the balance matches the book.");
  } else if (input.cashAfterNzd < -1e-6 && reducesCash) {
    problems.push("This would take cash below zero.");
  }
  return problems;
}

function trimQty(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
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
