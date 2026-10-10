/**
 * Public Swyftx display gate.
 * pull-check:crypto-dex-400-2026-10-11
 *
 * Swyftx terms §3.5 require written approval before their market data is published.
 * SWYFTX_PUBLIC_DISPLAY defaults off. While it is off, Swyftx prices, labels,
 * list rows, charts, and API bodies are not shown. The flag is read on each call.
 */

import { dexscreenerPublicDisplay } from "@/lib/dexscreener-display";

export function swyftxPublicDisplay(): boolean {
  const raw = (process.env.SWYFTX_PUBLIC_DISPLAY || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/** False for a gated source while its display flag is off. */
export function publicSourceAllowed(source: string | null | undefined): boolean {
  const id = (source || "").trim().toLowerCase();
  if (id === "swyftx" && !swyftxPublicDisplay()) return false;
  if (id === "dexscreener" && !dexscreenerPublicDisplay()) return false;
  return true;
}

export function gatePublicPrint<T extends { source?: string | null }>(print: T | null | undefined): T | null {
  if (!print) return null;
  if (!publicSourceAllowed(print.source)) return null;
  return print;
}
