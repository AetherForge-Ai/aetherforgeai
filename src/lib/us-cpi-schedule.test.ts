import { describe, expect, it } from "vitest";
import { getUpcomingEvents } from "@/lib/econ-calendar";
import { scheduledLabel } from "@/lib/news-present";
import { usCpiDateLabel } from "@/lib/us-cpi-schedule";

describe("M4 US CPI date", () => {
  it("uses 14 Oct 2026 (US) for the Stox catalyst and the news schedule", () => {
    const events = getUpcomingEvents("stock", "2026-10-10", 7);
    const cpi = events.find((event) => event.title === "US CPI inflation");
    expect(cpi?.date).toBe("2026-10-14");
    expect(cpi?.dateLabel).toBe("14 Oct 2026 (US)");
    expect(cpi?.dateLabel).not.toContain("13 Oct");
    expect(scheduledLabel("2026-10-14")).toBe("Scheduled: 14 Oct 2026 (US)");
    expect(usCpiDateLabel("2026-10-14")).toBe("14 Oct 2026 (US)");
  });
});
