// pull-check:v3-dashclean-d-b82-2026-10-27
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const search = readFileSync("src/components/dashboard/CryptoSearch.tsx", "utf8");
const dash = readFileSync("src/components/dashboard/PortfolioDashboard.tsx", "utf8");

describe("b77 (TT b75 P2): CryptoSearch picker passes axe", () => {
  it("no cmdk wrappers inside the listbox; options are direct role=option children", () => {
    expect(search).not.toMatch(/CommandList|CommandItem|CommandGroup/);
    expect(search).toMatch(/role="listbox"[\s\S]*?\{results\.map\(\(c, i\) => \(\s*<div[\s\S]*?role="option"/);
  });
  it("the popover trigger has an accessible name", () => {
    expect(search).toMatch(/aria-label=\{value \? `Cryptocurrency: \$\{value\}.*: "Select a cryptocurrency"\}/);
  });
  it("aria-controls only points at a rendered listbox", () => {
    expect(search).toMatch(/aria-controls=\{results\.length \? listId : undefined\}/);
  });
});

describe("b77 (TT b75/b76 P3): already-gone delete shows the not-found text for 8 s on the dedupe path", () => {
  it("the alreadyRemoved branch uses the server wording", () => {
    expect(dash).toMatch(/if \(res\.data\?\.alreadyRemoved\) toast\.info\(ALREADY_GONE_TEXT, \{ duration: 8000 \}\)/);
    expect(dash).toContain('"That row was not found. It was already removed, so nothing changed."');
    expect(dash).not.toMatch(/was already removed`/);
  });
});
