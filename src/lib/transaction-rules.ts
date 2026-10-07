/**
 * Blocks applied before a movement can be confirmed.
 * Messages are shown inline on the Record a transaction panel.
 */

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
      problems.push(`This sell is dated before the first buy of this asset (${input.firstBuyDate}).`);
    }
  }

  if (input.needsCash && !input.cashKnown) {
    problems.push("Cash is still loading. Wait until the balance matches the book.");
  } else if (input.cashAfterNzd < -1e-6 && (input.type === "buy" || input.type === "withdraw" || input.type === "tax")) {
    problems.push("This would take cash below zero.");
  }
  return problems;
}

function trimQty(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}
