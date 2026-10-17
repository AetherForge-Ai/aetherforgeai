import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("home disclaimer", () => {
  it("keeps the wording and places it after the closing call to action", () => {
    const page = read("src/app/page.tsx");
    const title = page.indexOf("Market intelligence for the book you hold");
    const cta = page.indexOf("Ready to take care of your portfolio?");
    // b5 CR-4: the home page renders the one shared disclaimer component after the CTA.
    const disclaimer = page.indexOf('<DisclaimerNotice variant="full"');
    expect(title).toBeGreaterThan(-1);
    expect(cta).toBeGreaterThan(title);
    expect(disclaimer).toBeGreaterThan(cta);
    expect(page.slice(title, cta)).not.toContain("DisclaimerNotice");
    const component = read("src/components/legal/DisclaimerNotice.tsx");
    expect(component).toContain("FmcStatement");
    expect(component).toContain('href="/ai-disclaimer"');
  });
});
