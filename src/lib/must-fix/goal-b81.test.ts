/**
 * DASH-CLEAN b81. pull-check:v3-b90-2026-10-29
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("DASH-CLEAN b81: signed-out dashboard tap targets", () => {
  it("ships the b81 build version", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b92-2026-10-31");
  });
  it("gives the signed-out prompt, header CTA, logo and dialog close 44px on mobile", () => {
    const prompt = read("src/components/dashboard/MemberDashboardPrompt.tsx");
    expect(prompt.match(/min-h-11 font-semibold md:min-h-9/g)?.length).toBe(2);
    const nav = read("src/components/TopNav.tsx");
    expect(nav).toContain('className="inline-flex min-h-11 items-center transition-opacity hover:opacity-90"');
    expect(nav).toContain('className="min-h-11 font-semibold shadow-glow md:min-h-8">\n                <Link href="/register">Get started free');
    expect(read("src/components/ui/dialog.tsx")).toContain("inline-flex size-11 items-center justify-center rounded-xs md:top-4 md:right-4 md:size-6");
  });
});
