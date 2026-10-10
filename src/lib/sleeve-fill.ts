/**
 * Headmaster sleeve fill (H3).
 *
 * A sleeve target that cannot be reached at the position cap, given the
 * qualifying Stox or Koins names, is reported as unallocated. Not-sized names
 * stay listed with their reasons. They are not silently used as fills.
 */

import { formatMoney } from "@/lib/currency";

export interface SleevePickSource {
  /** Undefined when that bot has not been run. Zero means the report had no qualifying name. */
  equitiesQualifying?: number;
  cryptoQualifying?: number;
  equitiesNotSized?: string[];
  cryptoNotSized?: string[];
}

export interface SleeveMove {
  assetClass: string;
  targetValueNZD: number;
  currentValueNZD: number;
}

function nzd(value: number): string {
  return formatMoney(Math.round(value * 100) / 100, "NZD", { decimals: 2 });
}

export function unallocatedSleeve(input: {
  targetNZD: number;
  heldNZD: number;
  capNZD: number;
  qualifyingPicks: number;
}): number {
  const target = Math.max(0, input.targetNZD);
  const held = Math.max(0, input.heldNZD);
  const cap = Math.max(0, input.capNZD);
  const picks = Math.max(0, Math.floor(input.qualifyingPicks));
  const gap = Math.max(0, target - held);
  const fillable = Math.min(gap, picks * cap);
  return Math.round((gap - fillable) * 100) / 100;
}

function sleeveSentence(
  label: string,
  targetNZD: number,
  heldNZD: number,
  capNZD: number,
  qualifying: number | undefined,
  notSized: string[]
): string | null {
  if (qualifying == null || !(targetNZD > 0)) return null;
  const unallocated = unallocatedSleeve({
    targetNZD,
    heldNZD,
    capNZD,
    qualifyingPicks: qualifying,
  });
  if (unallocated < 0.005) return null;
  const names = notSized.length ? ` Not sized, and not used to fill this sleeve: ${notSized.join(", ")}.` : "";
  return `${label}: ${nzd(unallocated)} unallocated: not enough qualifying picks.${names}`;
}

export function sleeveFillNotes(input: {
  totalNZD: number;
  maxPositionWeightPct: number;
  moves: SleeveMove[];
  picks?: SleevePickSource;
}): string[] {
  if (!input.picks) return [];
  const capNZD = Math.round(((Math.max(0, input.totalNZD) * input.maxPositionWeightPct) / 100) * 100) / 100;
  const row = (key: string) => input.moves.find((move) => move.assetClass === key);
  const equities = row("equities");
  const crypto = row("crypto");
  const notes = [
    equities
      ? sleeveSentence(
          "Equities sleeve",
          equities.targetValueNZD,
          equities.currentValueNZD,
          capNZD,
          input.picks.equitiesQualifying,
          input.picks.equitiesNotSized ?? []
        )
      : null,
    crypto
      ? sleeveSentence(
          "Crypto sleeve",
          crypto.targetValueNZD,
          crypto.currentValueNZD,
          capNZD,
          input.picks.cryptoQualifying,
          input.picks.cryptoNotSized ?? []
        )
      : null,
  ];
  return notes.filter((note): note is string => !!note);
}
