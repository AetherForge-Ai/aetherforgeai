/**
 * Public DexScreener display gate.
 * pull-check:retest4-2026-10-11
 *
 * DexScreener API terms allow a limited, revocable commercial licence and
 * prohibit making the API Services, or any portion of them, available for
 * third parties. Whether a public page counts is not settled here.
 * DEXSCREENER_PUBLIC_DISPLAY defaults off. While it is off, DexScreener is
 * not fetched and is not named. The flag is read on each call.
 */

export function dexscreenerPublicDisplay(): boolean {
  const raw = (process.env.DEXSCREENER_PUBLIC_DISPLAY || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/** Visitor credit for the DEX tab. The second name is included only when the flag is on. */
export function dexPoweredByLine(): string {
  if (dexscreenerPublicDisplay()) return "Powered by GeckoTerminal and DexScreener";
  return "Powered by GeckoTerminal";
}
