import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAPER_BOOK_STATEMENT } from "@/lib/public-copy";
import { cryptoCoveragePhrase } from "@/lib/crypto-coverage";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const STATEMENT =
  "AetherForge is a paper book: you record what you hold or would trade (cash, buys, sells, corrections, dividends) in NZ$. Real trades happen at your broker. We never move money.";

describe("U5 paper-book statement", () => {
  it("uses one sentence on the public pages that describe the book", () => {
    expect(PAPER_BOOK_STATEMENT).toBe(STATEMENT);
    expect(PAPER_BOOK_STATEMENT).not.toMatch(/GST|Grok|ZENITH|ULTRA/i);
    const pages = [
      "src/app/trust/page.tsx",
      "src/app/how-it-works/page.tsx",
      "src/app/terms-of-service/page.tsx",
      "src/app/page.tsx",
    ];
    for (const path of pages) {
      const source = read(path);
      expect(source.includes("PAPER_BOOK_STATEMENT") || source.includes(STATEMENT)).toBe(true);
      expect(source).not.toMatch(/Acquire your assets elsewhere|You still execute elsewhere|execute elsewhere/);
    }
    const privacy = read("src/app/privacy-policy/page.tsx");
    expect(privacy).toMatch(/Paper-book records/);
    expect(privacy).toMatch(/foreign-exchange/);
    expect(privacy).toMatch(/CSV export/);
    expect(privacy).toMatch(/corrections and dividends/);
    const terms = read("src/app/terms-of-service/page.tsx");
    expect(terms).toMatch(/not a broker and does not execute/);
  });
});

describe("U3 crypto markets copy", () => {
  it("does not publish an approximate 90-coin list", () => {
    expect(cryptoCoveragePhrase(89)).not.toMatch(/~/);
    expect(cryptoCoveragePhrase(400)).toBe("The top 400 coins by market cap");
    const explorer = read("src/components/dashboard/MarketsExplorer.tsx");
    expect(explorer).toMatch(/Add to paper book/);
    expect(explorer).toMatch(/DEX top 400/);
    expect(explorer).toMatch(/Blockchain/);
    expect(explorer).toMatch(/isCryptoTab \? "Name" : "Company"/);
    expect(explorer).not.toMatch(/~90/);
    const detail = read("src/components/dashboard/crypto/CoinDetailView.tsx");
    expect(detail).toMatch(/Add to paper book/);
    const panel = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(panel).toMatch(/seed\.market === "DEX"/);
    const asset = read("src/components/dashboard/CryptoAssetPage.tsx");
    expect(asset).toMatch(/Crypto markets/);
    expect(asset).not.toMatch(/Stock Markets/);
  });
});
