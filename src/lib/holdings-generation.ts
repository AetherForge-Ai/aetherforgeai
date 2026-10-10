/**
 * Client-only generation counter for holdings snapshots.
 *
 * A /api/stocks or refresh response that started before a trade commit still
 * carries the pre-trade quantity (the handler copied `shares` before the
 * quote overlay returned). Applying that body after the ledger POST is how
 * a holding "comes back" while the new ledger row stays. Callers bump this
 * when a buy or sell is accepted, and ignore any snapshot captured earlier.
 */

let generation = 0;

export function holdingsGeneration(): number {
  return generation;
}

export function bumpHoldingsGeneration(): number {
  generation += 1;
  return generation;
}

export function holdingsResponseIsStale(captured: number): boolean {
  return captured !== generation;
}

/**
 * After the record dialog closes, apply a snapshot taken after the trade.
 * A snapshot from before the trade, or a trade with no snapshot yet, is refetched
 * so a full sell does not leave the old row on screen.
 */
export function holdingsActionAfterDialogClose(input: {
  generationAtOpen: number | null;
  generationNow: number;
  pendingGeneration: number | null;
}): "apply" | "refetch" | "keep" {
  const traded = input.generationAtOpen != null && input.generationNow !== input.generationAtOpen;
  const pendingFresh = input.pendingGeneration != null && input.pendingGeneration === input.generationNow;
  if (pendingFresh) return "apply";
  if (traded || input.pendingGeneration != null) return "refetch";
  return "keep";
}

export function __resetHoldingsGenerationForTests(): void {
  generation = 0;
}
