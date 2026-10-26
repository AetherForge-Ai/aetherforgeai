/**
 * M-7b: text colours for the CryptoSearch option rows (Price Alerts coin picker).
 * The shared pctColor uses rose-600 (#e11d48), which is 4.46:1 on the highlighted
 * row (accent #ecfdf5), under the 4.5:1 AA minimum. These pairs pass 4.5:1 on the
 * popover and the highlighted row, in light and dark tokens.
 * The hex values mirror Tailwind and globals.css, and the contrast test checks them.
 */
export const CRYPTO_SEARCH_TEXT = {
  gain: { className: "text-emerald-700 dark:text-emerald-300", light: "#047857", dark: "#6ee7b7" },
  loss: { className: "text-rose-700 dark:text-rose-300", light: "#be123c", dark: "#fda4af" },
  flat: { className: "text-slate-600 dark:text-slate-300", light: "#475569", dark: "#cbd5e1" },
} as const;

/** Row backgrounds: popover and highlighted (bg-accent), light then dark tokens. */
export const CRYPTO_SEARCH_BACKGROUNDS = {
  light: ["#ffffff", "#ecfdf5"],
  dark: ["#1e293b", "#134e4a"],
} as const;

export function cryptoSearchPctClass(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return CRYPTO_SEARCH_TEXT.flat.className;
  return n > 0 ? CRYPTO_SEARCH_TEXT.gain.className : CRYPTO_SEARCH_TEXT.loss.className;
}

/** WCAG 2.x contrast ratio for two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [lo, hi] = [lum(a), lum(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}
