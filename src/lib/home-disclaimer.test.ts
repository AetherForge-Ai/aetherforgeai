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
    const cta = page.indexOf("Ready to take care of your Portfolio?");
    const disclaimer = page.indexOf("Not financial advice.");
    expect(title).toBeGreaterThan(-1);
    expect(cta).toBeGreaterThan(title);
    expect(disclaimer).toBeGreaterThan(cta);
    expect(page.slice(title, cta)).not.toContain("Not financial advice.");
    expect(page).toContain("is not a licensed financial");
    expect(page).toContain("we don&apos;t place trades or take custody.");
    expect(page).toContain('href="/ai-disclaimer"');
  });
});
