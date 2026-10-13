import { describe, expect, it } from "vitest";
import {
  STRUCTURED_DRIVER_INSTRUCTION,
  WITHHELD_NOTE,
  groundNarrative,
  ungroundedFigures,
} from "@/lib/grounded-briefing";

const CONTEXT = "FPH price 36.80. RSI 64. 7-day model 1.2%. MACD bullish. Signal Hold.";

describe("grounded briefing", () => {
  it("keeps a note that only repeats supplied figures", () => {
    const answer = "Momentum — RSI 64 and the 7-day model is 1.2% — the tape is calm.\n\n_Informational market intelligence only, not personalised financial advice._";
    const grounded = groundNarrative(answer, `${STRUCTURED_DRIVER_INSTRUCTION}\n${CONTEXT}`);
    expect(grounded.withheld).toBe(false);
    expect(grounded.text).toContain("1.2%");
  });

  it("withholds a percent that was not supplied", () => {
    const answer = "The week is set for a 7% move.";
    expect(ungroundedFigures(answer, CONTEXT).map((figure) => figure.value)).toContain(7);
    const grounded = groundNarrative(answer, CONTEXT);
    expect(grounded.withheld).toBe(true);
    expect(grounded.text).toBe(WITHHELD_NOTE);
    expect(grounded.text).not.toMatch(/\d/);
    expect(grounded.text).not.toMatch(/\bGST\b/);
  });

  it("withholds an invented price", () => {
    const grounded = groundNarrative("Resistance sits at 44.10.", CONTEXT);
    expect(grounded.withheld).toBe(true);
  });
});
