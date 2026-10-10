import { describe, expect, it } from "vitest";
import {
  aggressiveMomentumStep,
  balancedGrowthStep,
  indefiniteArticle,
  namedCandidateLine,
  notSizedLine,
  sessionGainerSentence,
  stripReportMarkdown,
} from "@/lib/report-copy";

describe("report copy", () => {
  it("uses an before 8, 11 and 18", () => {
    expect(indefiniteArticle(8)).toBe("an");
    expect(indefiniteArticle(11)).toBe("an");
    expect(indefiniteArticle(18)).toBe("an");
    expect(indefiniteArticle(7)).toBe("a");
  });

  it("matches singular and plural candidate lines", () => {
    expect(namedCandidateLine(1)).toBe(
      "Empty holdings — leading with 1 named BUY/ACCUMULATE candidate from the full-market sweep."
    );
    expect(namedCandidateLine(2)).toContain("2 named BUY/ACCUMULATE candidates");
  });

  it("strips preview markdown", () => {
    expect(stripReportMarkdown("**WOR.AX** and **87%** _Informational only_")).toBe(
      "WOR.AX and 87% Informational only"
    );
  });

  it("builds the session line from the same gainers", () => {
    const gainers = [{ ticker: "MILD.AX", changePct: 4.2 }];
    expect(sessionGainerSentence(gainers, 1)).toBe("MILD.AX leads the session (+4.2%) and tops the gainer board.");
    expect(sessionGainerSentence([], 2)).toBe(
      "Standout 24-hour prints are under review, so this report does not name a session leader."
    );
    expect(sessionGainerSentence([], 0)).toBe("No standout session gainers — the tape is consolidating.");
  });

  it("does not call a capped buy the strongest momentum name", () => {
    const step = aggressiveMomentumStep(["AAA", "BBB"], [
      { ticker: "LEADER", projected7dPct: 7.5 },
      { ticker: "AAA", projected7dPct: 2 },
    ]);
    expect(step).not.toMatch(/strongest momentum/i);
    expect(step).toContain("LEADER");
    expect(step).toContain("suitability cap");
  });

  it("does not open a position on a 0.00% pathway", () => {
    expect(balancedGrowthStep(0, "AAA", "stock")).toBe(
      "This pathway's 7-day target is 0.00%, so it does not initiate a position."
    );
    expect(balancedGrowthStep(0, "AAA", "stock")).not.toMatch(/Initiate/);
  });

  it("keeps a reason on every not-sized name", () => {
    const line = notSizedLine([
      { ticker: "ADA", reason: "7-day projection -0.54% is not positive" },
      { ticker: "MAH.AX", reason: "only 2 new names are sized on this tape" },
    ]);
    expect(line).toContain("ADA (7-day projection -0.54% is not positive)");
    expect(line).toContain("MAH.AX (only 2 new names are sized on this tape)");
    expect(line).not.toMatch(/too aggressive/i);
  });
});
