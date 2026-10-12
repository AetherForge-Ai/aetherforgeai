import { MISSING_MARK, type SnapshotFigure } from "@/lib/portfolio-snapshot";

/** A blank snapshot figure. The display is an em dash and the reason is the explanation. */
export function blankSnapshotFigure(formula: string, reason: string, source: string, asOf: string): SnapshotFigure {
  return {
    value: null,
    display: MISSING_MARK,
    reason,
    maths: { formula, inputs: [reason], arithmetic: MISSING_MARK, source, asOf },
  };
}
