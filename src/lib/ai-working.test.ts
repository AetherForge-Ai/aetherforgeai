import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { aiShowWorkingEnabled, CHALLENGE_PROMPT, latestAsOf, showWorking } from "@/lib/ai-working";

const ctx = `PORTFOLIO SUMMARY (3 holdings):
- Total market value: $12,345.67
- Total cost basis: $10,000.00
- Total unrealized P/L: $2,345.67 (+23.46%)
SECTOR ALLOCATION:
- Technology: 61.2% ($7,555.55)
HOLDINGS DETAIL:
- FPH (Fisher & Paykel) | Health | 40 shares @ avg $25.00, now $33.10 | value $1,324.00 | P/L +32.40% | weight 10.7%`;

describe("G-19 show your working", () => {
  it("traces every figure to the context: High", () => {
    const w = showWorking("Your book is worth $12,345.67, up 23.46%. Technology is 61.2%. FPH is 10.7% at $33.10.", ctx, { asOf: "2026-10-26T21:00:00Z" });
    expect(w.unsupported).toEqual([]);
    expect(w.confidence).toBe("High");
    expect(w.checkedNumbers).toBe(5);
    expect(w.sources[0].label).toBe("Your portfolio");
    expect(w.asOf).toMatch(/27 Oct 2026/);
  });
  it("accepts rounding to the reply's precision", () => {
    expect(showWorking("Up about 23.5%, tech near 61%, worth about $12,346.", ctx).unsupported).toEqual([]);
  });
  it("flags invented numbers: Low", () => {
    const w = showWorking("FPH could reach $48.00 and the market rose 4.2% today.", ctx);
    expect(w.unsupported).toEqual(["$48.00", "4.2%"]);
    expect(w.confidence).toBe("Low");
  });
  it("ignores years, list numbers and small counts; no figures is Medium", () => {
    const w = showWorking("1. Hold 3 sectors in 2026.\n2. Review twice a year.", ctx);
    expect(w.checkedNumbers).toBe(0);
    expect(w.confidence).toBe("Medium");
  });
  it("as-of is the latest price time", () => {
    expect(latestAsOf([{ updatedAt: "2026-10-25T00:00:00Z" }, { updatedAt: "2026-10-26T00:00:00Z" }, {}])).toBe("2026-10-26T00:00:00.000Z");
    expect(latestAsOf([])).toBeNull();
  });
  it("flag is off unless AI_SHOW_WORKING=1; challenge asks for the source lines", () => {
    expect(aiShowWorkingEnabled({})).toBe(false);
    expect(aiShowWorkingEnabled({ AI_SHOW_WORKING: "true" })).toBe(false);
    expect(aiShowWorkingEnabled({ AI_SHOW_WORKING: "1" })).toBe(true);
    expect(CHALLENGE_PROMPT).toMatch(/assumption/);
  });
  it("route only adds working behind the flag; refusals never get it", () => {
    const src = readFileSync("src/app/api/chat/route.ts", "utf8");
    expect(src).toMatch(/raw != null && sendMessages != null && aiMode === \"on\" && \(aiShowWorkingEnabled\(\) \|\| testHooksAllowedFor\(user as never\)\)/);
    expect(src).toMatch(/\.\.\.\(working \? \{ working \} : \{\}\)/);
  });
});
