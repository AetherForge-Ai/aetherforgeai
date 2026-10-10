import { describe, expect, it } from "vitest";
import { latestIso, presentStatusFeed } from "./status-feeds";

describe("status feeds", () => {
  const now = Date.parse("2026-10-11T00:00:00.000Z");

  it("shows a real provider time and amber when the time is missing", () => {
    const fresh = presentStatusFeed("Exchange rates", "2026-10-10T12:00:00.000Z", now);
    expect(fresh.tone).toBe("ok");
    expect(fresh.text).not.toBe("unavailable");
    expect(presentStatusFeed("Metals spot", null, now)).toEqual({
      label: "Metals spot",
      tone: "amber",
      text: "unavailable",
    });
    expect(presentStatusFeed("Equity quotes", "2026-09-01T00:00:00.000Z", now).tone).toBe("amber");
  });

  it("picks the newest provider timestamp and ignores blanks", () => {
    expect(latestIso([null, "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"])).toBe(
      "2026-10-02T00:00:00.000Z"
    );
    expect(latestIso([undefined, ""])).toBeNull();
  });
});
