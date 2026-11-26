import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { YourMoneySection } from "@/components/trust/YourMoneySection";
import { LONG_DISCLAIMER_PARAGRAPHS } from "@/lib/disclaimer";
import { PAPER_BOOK_STATEMENT } from "@/lib/public-copy";
import {
  TRUST_MONEY_FILE_SENTENCE,
  TRUST_MONEY_HEADING,
  TRUST_MONEY_LOGIN_SENTENCE,
  TRUST_MONEY_ORDERS_SENTENCE,
  TRUST_MONEY_RECORD_SENTENCE,
  TRUST_MONEY_SECTIONS,
  trustMoneyOrdersMatchDisclaimer,
  trustMoneyVisibleText,
  trustMoneyWordCount,
} from "@/lib/trust-money";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function visibleText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("your money stays with you", () => {
  it("renders the section on the server with headings", () => {
    const html = renderToStaticMarkup(createElement(YourMoneySection));
    expect(html).toContain('<section id="your-money"');
    expect(html).toContain('aria-labelledby="your-money-heading"');
    expect(html).toContain('<h2 id="your-money-heading"');
    expect(html).toContain(TRUST_MONEY_HEADING);
    for (const section of TRUST_MONEY_SECTIONS) {
      expect(html).toContain(`<h3 id="${section.id}"`);
      expect(html).toContain(section.heading);
      expect(html).toContain(section.body);
    }
    const words = trustMoneyWordCount(visibleText(html));
    expect(words).toBeGreaterThanOrEqual(80);
    expect(words).toBeLessThanOrEqual(180);
    expect(words).toBe(trustMoneyWordCount(trustMoneyVisibleText()));
  });

  it("is included by the server /trust page", () => {
    const page = read("src/app/trust/page.tsx");
    expect(page).not.toMatch(/["']use client["']/);
    expect(page).toContain("<YourMoneySection />");
    expect(read("src/components/trust/YourMoneySection.tsx")).not.toMatch(/["']use client["']/);
  });

  it("maps each sentence to an existing /trust statement or the import code", () => {
    const page = read("src/app/trust/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("PAPER_BOOK_STATEMENT");
    expect(PAPER_BOOK_STATEMENT).toContain("We never move money.");
    expect(page).toContain(TRUST_MONEY_RECORD_SENTENCE);
    expect(page).toContain(TRUST_MONEY_LOGIN_SENTENCE);
    expect(page).toContain('variant="full"');
    expect(trustMoneyOrdersMatchDisclaimer()).toBe(true);
    expect(LONG_DISCLAIMER_PARAGRAPHS[0]).toContain(TRUST_MONEY_ORDERS_SENTENCE);
    expect(TRUST_MONEY_SECTIONS[0].body.startsWith(PAPER_BOOK_STATEMENT)).toBe(true);
    expect(TRUST_MONEY_SECTIONS[0].body).toContain(TRUST_MONEY_RECORD_SENTENCE);

    const importer = read("src/app/import/import-client.tsx");
    expect(importer).toContain("Upload a broker CSV or XLSX.");
    expect(importer).toContain("Nothing is saved until you confirm the preview.");
    expect(importer).toContain('accept=".csv,.xlsx,');
    const persist = read("src/lib/import/persist.ts");
    expect(persist).toContain('if (action !== "commit")');
    expect(persist).toMatch(/return NextResponse\.json\(\{ ok: true, error: preview\.error/);
    expect(TRUST_MONEY_FILE_SENTENCE).toContain("CSV or XLSX");
    expect(TRUST_MONEY_FILE_SENTENCE).toContain("Nothing from that file is saved until you confirm the preview.");
    expect(TRUST_MONEY_FILE_SENTENCE).toContain("You record what you hold");
    expect(PAPER_BOOK_STATEMENT).toContain("you record what you hold");
  });

  it("leaves out claims the broker sync code contradicts, and adds no new guarantee", () => {
    const html = renderToStaticMarkup(createElement(YourMoneySection));
    const copy = `${read("src/lib/trust-money.ts")}\n${read("src/components/trust/YourMoneySection.tsx")}\n${html}`;
    expect(copy).not.toMatch(/does not connect|do not connect|never connect/i);
    expect(copy).not.toMatch(/only source|only from (a |the )?file|all of your data|all data comes/i);
    expect(copy).not.toMatch(/Hatch|Stake|DriveWealth|bank-level|bank-grade|never hacked|insured|SOC 2|penetration test/i);
    expect(copy).not.toMatch(/\breal-time\b|\bofficial\b|\blicensed\b/i);
    expect(read("src/lib/broker-sync/ibkr-flex.ts")).toContain("read-only reports");
    expect(read("src/app/api/broker/ibkr/route.ts")).toContain("Flex token");
  });
});
