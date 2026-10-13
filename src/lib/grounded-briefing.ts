/**
 * Keeps an AI note tied to the figures it was given.
 * A percent or a price that does not appear in the supplied text is withheld.
 * The note is general information, not a personal recommendation.
 */

export const STRUCTURED_DRIVER_INSTRUCTION = [
  "Explain drivers in this structure only.",
  "Each driver is one line: Driver — evidence — read.",
  "The evidence must repeat a figure already written in the input. Do not compute a new figure.",
  "Do not introduce a price, a percent, a date, or a count that is not written in the input.",
  "The read on that line must not contain a number.",
  "Do not name an account, an email address, or a person.",
  "Do not tell the reader to buy, sell, or deploy cash.",
  "End with this line and nothing after it: _Informational market intelligence only, not personalised financial advice._",
].join(" ");

export const WITHHELD_NOTE =
  "This note was withheld because it included a figure that was not in the supplied data.\n\n_Informational market intelligence only, not personalised financial advice._";

interface Figure {
  value: number;
  percent: boolean;
}

const FIGURE = /(?<![A-Za-z])(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+\.\d+|-?\d+)(%?)/g;

export function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  for (const match of text.matchAll(FIGURE)) {
    const raw = match[1].replace(/,/g, "");
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ value, percent: match[2] === "%" });
  }
  return out;
}

export function figureIsGrounded(claim: Figure, allowed: readonly Figure[]): boolean {
  for (const base of allowed) {
    if (claim.percent && !base.percent) continue;
    const tolerance = Math.max(0.05, Math.abs(base.value) * 0.005);
    if (Math.abs(claim.value - base.value) <= tolerance) return true;
  }
  return false;
}

/** Figures in the answer that are not present in the supplied text. */
export function ungroundedFigures(answer: string, context: string): Figure[] {
  const allowed = figuresIn(context);
  return figuresIn(answer).filter((claim) => !figureIsGrounded(claim, allowed));
}

/**
 * Returns the answer when every figure is in the supplied text.
 * Otherwise returns a fixed withheld note that contains no new figure.
 */
export function groundNarrative(answer: string, context: string): { text: string; withheld: boolean } {
  const clean = answer.trim();
  if (!clean) return { text: WITHHELD_NOTE, withheld: true };
  if (ungroundedFigures(clean, context).length) return { text: WITHHELD_NOTE, withheld: true };
  return { text: clean, withheld: false };
}
