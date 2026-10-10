import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("batch 1 accessibility", () => {
  it("adds a skip link and raises the signed-in disclaimer contrast", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('href="#main"');
    expect(layout).toContain("Skip to content");
    expect(layout).toContain('id="main"');
    expect(layout).toContain("overflow-x-clip");
    const notice = read("src/components/legal/DisclaimerNotice.tsx");
    expect(notice).toContain("text-sm leading-relaxed text-foreground");
    expect(notice).not.toContain("text-[11px]");
    expect(notice).toContain("not a licensed financial advice provider");
  });
});
