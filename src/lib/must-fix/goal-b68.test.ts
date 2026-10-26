// pull-check:v3-cr6-b78-2026-10-27
/** b68 (Chief, 27 Oct 2026): G-24 paste samples, G-07 caps meter behind HOLDING_CAPS_V2, b67 P3 POL symbol, noindex audit. */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePastedTrades, pastedRowsToCsv, type PastedRow } from "@/lib/paste-import";
import { HOLDINGS_NEAR_SHARE, holdingsMeterState } from "@/lib/holding-caps";
import { CRYPTO_VENDORS, coingeckoIdFor, normalizeCryptoTicker, vendorFor } from "@/lib/crypto-vendors";
import { tickerForCoingeckoId } from "@/lib/crypto-ids";
import { vendorByCoingeckoId } from "@/lib/crypto-public-meta";
import { searchAssets } from "@/lib/asset-search";
import { TICKER_TAPE } from "@/lib/ticker-feed";

const read = (p: string) => readFileSync(p, "utf8");

type Want = Omit<PastedRow, "reference">;
const { samples } = JSON.parse(read("qa/g24-b68/samples.json")) as { samples: { id: number; text: string; rows: Want[] }[] };

function rowRight(r: PastedRow | undefined, w: Want): boolean {
  if (!r) return false;
  return (
    r.type === w.type &&
    r.ticker === w.ticker &&
    (w.type === "Dividend" || r.quantity === w.quantity) &&
    r.price === w.price &&
    r.currency === w.currency &&
    r.date === w.date &&
    (r.fees ?? null) === w.fees &&
    (r.tax ?? null) === w.tax
  );
}

describe("b68 G-24 paste-anything: 20 synthetic samples", () => {
  it("has 20 samples, all synthetic, with expected rows", () => {
    expect(samples).toHaveLength(20);
    expect(samples.every((s) => s.rows.length >= 1)).toBe(true);
  });
  it("95%+ of rows are right going into the review table", () => {
    let right = 0;
    let total = 0;
    const misses: string[] = [];
    for (const s of samples) {
      const { rows } = parsePastedTrades(s.text);
      s.rows.forEach((w, i) => {
        total += 1;
        if (rowRight(rows[i], w)) right += 1;
        else misses.push(`#${s.id}.${i + 1} ${JSON.stringify(rows[i] ?? null)}`);
      });
      expect(rows.length, `sample ${s.id} row count`).toBe(s.rows.length);
    }
    console.log(`b68 G-24: ${right}/${total} rows right${misses.length ? `\n${misses.join("\n")}` : ""}`);
    expect(right / total).toBeGreaterThanOrEqual(0.95);
  });
  it('"200 XRP" is XRP, not RP; "10 x AAPL" still reads AAPL', () => {
    expect(parsePastedTrades("Bought 200 XRP @ US$0.53 on 2 Oct 2026").rows[0].ticker).toBe("XRP");
    expect(parsePastedTrades("Bought 10 x AAPL @ US$228.40 on 2 Oct 2026").rows[0].ticker).toBe("AAPL");
  });
  it("an undated row stays blank (the member sets it in review), never today", () => {
    const s = samples.find((x) => x.id === 16)!;
    expect(parsePastedTrades(s.text).rows[0].date).toBeNull();
  });
  it("nothing is saved before review: the paste box only hands a CSV to the import review", () => {
    const src = read("src/components/import/PasteTradesBox.tsx");
    expect(src).toContain("onCsv(pastedRowsToCsv(");
    expect(src).toContain("Nothing is saved until you confirm there.");
    expect(src).not.toMatch(/method:\s*"(POST|PUT|PATCH)"/);
    expect(src).not.toMatch(/\/api\/(transactions|ledger|portfolio)/);
    const lib = read("src/lib/paste-import.ts");
    expect(lib).not.toMatch(/\bfetch\(/);
    expect(pastedRowsToCsv(parsePastedTrades(samples[0].text).rows).split("\n")[0]).toBe("Date,Type,Ticker,Quantity,Price,Currency,Fees,Reference");
  });
});

describe("b68 G-07 holdings caps meter (HOLDING_CAPS_V2, OFF in prod)", () => {
  it("ok / near / full / unlimited", () => {
    expect(holdingsMeterState(12, 25)).toMatchObject({ text: "12 of 25 used", level: "ok", percent: 48, hint: null });
    expect(holdingsMeterState(20, 25)).toMatchObject({ text: "20 of 25 used", level: "near", percent: 80, hint: "5 holdings left on your plan." });
    expect(holdingsMeterState(9, 10)).toMatchObject({ level: "near", hint: "1 holding left on your plan." });
    expect(holdingsMeterState(10, 10)).toMatchObject({ text: "10 of 10 used", level: "full", percent: 100 });
    expect(holdingsMeterState(12, 10)).toMatchObject({ text: "10 of 10 used", level: "full", percent: 100 });
    expect(holdingsMeterState(40, null)).toMatchObject({ text: "40 used", level: "unlimited", hint: null });
    expect(holdingsMeterState(40, 100000).level).toBe("unlimited");
    expect(HOLDINGS_NEAR_SHARE).toBe(0.8);
  });
  it("flag is OFF unless HOLDING_CAPS_V2=1, and the rail only shows the meter when the server says on", () => {
    expect(read("src/lib/feature-flags.ts")).toContain('export const HOLDING_CAPS_V2 = on("HOLDING_CAPS_V2");');
    expect(read("wrangler.jsonc")).not.toMatch(/HOLDING_CAPS_V2/);
    expect(read("src/app/api/flags/holding-caps/route.ts")).toContain("holdingCapsV2: HOLDING_CAPS_V2");
    const meter = read("src/components/dashboard/rail/HoldingCapsMeter.tsx");
    expect(meter).toContain("useState(false)");
    expect(meter).toContain('j?.data?.holdingCapsV2 === true');
    expect(read("src/components/dashboard/rail/DashboardRail.tsx")).toContain("capsV2 && row.label === \"Holdings\"");
  });
});

describe("b68 b67-P3: polygon-ecosystem-token is POL", () => {
  it("slug lookups return POL, never MATIC", () => {
    expect(tickerForCoingeckoId("polygon-ecosystem-token")).toBe("POL");
    expect(vendorByCoingeckoId("polygon-ecosystem-token")?.ticker).toBe("POL");
    expect(CRYPTO_VENDORS.MATIC).toBeUndefined();
    expect(Object.values(CRYPTO_VENDORS).filter((v) => v.coingecko === "polygon-ecosystem-token").map((v) => v.ticker)).toEqual(["POL"]);
  });
  it("MATIC still resolves (old holdings and alerts) and is a search word for POL", () => {
    expect(normalizeCryptoTicker("matic")).toBe("POL");
    expect(vendorFor("MATIC")?.ticker).toBe("POL");
    expect(coingeckoIdFor("MATIC-USD")).toBe("polygon-ecosystem-token");
    const coins = [
      { symbol: "POL", name: "POL (ex-MATIC)", market: "Crypto" as const, assetType: "crypto" as const, id: "polygon-ecosystem-token", price: 0.2 },
      { symbol: "POLS", name: "Polkastarter", market: "Crypto" as const, assetType: "crypto" as const, id: "polkastarter", price: 0.3 },
    ];
    const plain = coins.map((c) => ({ ...c, name: c.symbol === "POL" ? "Polygon" : c.name }));
    expect(searchAssets("matic", { coins: plain })[0]?.symbol).toBe("POL");
    expect(searchAssets("MATIC", { coins })[0]?.symbol).toBe("POL");
    expect(searchAssets("pol", { coins })[0]?.symbol).toBe("POL");
  });
  it("ticker crypto row stays at 11 coins, with no POL or MATIC", () => {
    const syms = TICKER_TAPE.crypto.map((r) => r.symbol);
    expect(syms).toHaveLength(11);
    expect(syms).not.toContain("POL");
    expect(syms).not.toContain("MATIC");
  });
});

describe("b68 noindex audit: public marketing pages are indexable", () => {
  const sitemap = read("src/app/sitemap.ts");
  const paths = [...sitemap.matchAll(/\{ path: "([^"]*)"/g)].map((m) => m[1]);
  it("no sitemap page sets robots index:false", () => {
    expect(paths.length).toBeGreaterThan(20);
    for (const p of paths) {
      const file = `src/app${p}/page.tsx`;
      if (!existsSync(file)) continue;
      expect(read(file), file).not.toMatch(/index:\s*false/);
    }
  });
  it("root layout and next.config send no site-wide noindex", () => {
    expect(read("src/app/layout.tsx")).not.toMatch(/noindex|index:\s*false/);
    expect(read("next.config.ts")).not.toMatch(/X-Robots-Tag|noindex/i);
    expect(read("src/middleware.ts")).not.toMatch(/X-Robots-Tag|noindex/i);
  });
  it("private, test and share pages keep noindex", () => {
    for (const f of ["src/app/shared/page.tsx", "src/app/share/accept/page.tsx", "src/app/admin/page.tsx", "src/app/projections/page.tsx", "src/app/tax/fif/page.tsx", "src/app/dashboard/goals/page.tsx"]) {
      expect(read(f), f).toMatch(/index:\s*false/);
    }
  });
});
