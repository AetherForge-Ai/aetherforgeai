import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERFORMANCE_SAMPLE } from "@/lib/performance-sample";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("H10 example results", () => {
  it("uses one name, one historical label and one 1.98% definition", () => {
    expect(PERFORMANCE_SAMPLE.name).toBe("Example results");
    expect(PERFORMANCE_SAMPLE.label).toBe("Historical sample, 7–8 Jul 2026");
    expect(PERFORMANCE_SAMPLE.opening).toBe("NZ$100,429.00");
    expect(PERFORMANCE_SAMPLE.high).toBe("NZ$102,421.30");
    expect(PERFORMANCE_SAMPLE.move).toBe("NZ$1,992.30");
    expect(PERFORMANCE_SAMPLE.pct).toBe("1.98%");
    expect(PERFORMANCE_SAMPLE.openTime).toBe("9:20 am");
    expect(PERFORMANCE_SAMPLE.afternoonTime).toBe("2:30 pm");
    expect(PERFORMANCE_SAMPLE.laterTime).toBe("3:47 pm");
    expect(PERFORMANCE_SAMPLE.definition).toContain("1.98%");
    expect(PERFORMANCE_SAMPLE.definition).toContain("NZ$100,429.00");
    expect(PERFORMANCE_SAMPLE.definition).not.toMatch(/open-to-high/i);
    expect(PERFORMANCE_SAMPLE.definition).toContain("not a 7-day figure");
  });

  it("keeps July, unspaced times and a second definition off the page", () => {
    const page = read("src/app/performance/page.tsx");
    const gallery = read("src/components/performance/LiveExamplesGallery.tsx");
    expect(page).toContain('title: "Example results · AetherForge AI"');
    expect(page).toContain("PERFORMANCE_SAMPLE");
    expect(page).not.toContain("July");
    expect(page).not.toContain("9:20am");
    expect(page).not.toMatch(/open-to-high/i);
    expect(gallery).not.toContain("July");
    expect(gallery).not.toContain("9:20am");
    expect(gallery).not.toMatch(/open-to-high/i);
    expect(gallery).toContain("NZ$100,429.00");
    expect(gallery).toContain("PERFORMANCE_SAMPLE.openTime");
  });
});
