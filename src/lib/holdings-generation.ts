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

export function __resetHoldingsGenerationForTests(): void {
  generation = 0;
}
