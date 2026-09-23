"use client";

/**
 * Client-side fill pre-check + red banner helpers.
 * Re-exports pure checks; adds toast-friendly formatting.
 */

export {
  checkFillSanity,
  ADVISORY_NOTE,
  SANITY_RATIO_SOFT,
  type FillSanityInput,
  type FillSanityResult,
  type ExecutionStatus,
  type PriceSource,
} from "@/lib/fill-integrity";

export function formatSanityBanner(result: {
  blocked?: boolean;
  message?: string;
  ratio?: number;
  liveValue?: number;
  storedValue?: number;
}): string | null {
  if (!result.blocked || !result.message) return null;
  return result.message;
}
