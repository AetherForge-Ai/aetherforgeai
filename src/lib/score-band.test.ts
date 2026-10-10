import { describe, expect, it } from "vitest";
import { scoreBand } from "./score-band";

describe("score bands", () => {
  it("calls a score strong only at 67 and above", () => {
    expect(scoreBand(0)).toBe("weak");
    expect(scoreBand(33)).toBe("weak");
    expect(scoreBand(34)).toBe("moderate");
    expect(scoreBand(66)).toBe("moderate");
    expect(scoreBand(66.9)).toBe("moderate");
    expect(scoreBand(67)).toBe("strong");
    expect(scoreBand(100)).toBe("strong");
  });
});
