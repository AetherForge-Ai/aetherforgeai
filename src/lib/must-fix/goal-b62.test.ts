/**
 * b62 (23 Oct 2026): GSC-404 redirects, TT P2 DEX last-good list + /status DEX row, TT P3 crypto count line.
 * pull-check:v3-dashclean-d-b82-2026-10-27
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../../next.config";
import { middleware } from "../../middleware";
import { GSC_404_REDIRECTS, gsc404Redirect } from "@/lib/gsc-404-redirects";
import { cryptoCountLine } from "@/lib/crypto-coverage";
import { DEX_STATUS_LABEL, dexStatusRow } from "@/lib/status-feeds";
import { CHANGELOG_ENTRIES } from "@/lib/changelog-entries";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("b62 GSC-404: URLs Search Console saw as 404 get one 308", () => {
  const cases: Array<[string, string]> = [
    ["/own-the-bots", "/buy-the-bots"],
    ["/own-the-bots/", "/buy-the-bots"],
    ["/own-the-bots/performance", "/buy-the-bots"],
    ["/security.txt", "/.well-known/security.txt"],
    ["/manifest.webmanifest", "/site.webmanifest"],
    ["/manifest.json", "/site.webmanifest"],
  ];
  it.each(cases)("middleware sends %s to %s with 308", async (path, dest) => {
    const res = await middleware(new NextRequest(`https://aetherforgeai.co.nz${path}`));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`https://aetherforgeai.co.nz${dest}`);
    expect(gsc404Redirect(path)).toBe(dest);
  });

  it("next.config carries every row as permanent (308)", async () => {
    const rows = await nextConfig.redirects!();
    for (const row of GSC_404_REDIRECTS) {
      expect(rows).toContainEqual({ source: row.source, destination: row.destination, permanent: true });
    }
  });

  it("targets exist and live pages are untouched", () => {
    expect(existsSync("public/.well-known/security.txt")).toBe(true);
    expect(existsSync("public/site.webmanifest")).toBe(true);
    expect(existsSync("src/app/buy-the-bots/page.tsx")).toBe(true);
    expect(read("public/llms.txt")).toContain("https://aetherforgeai.co.nz/sitemap.xml");
    for (const path of ["/", "/buy-the-bots", "/markets", "/.well-known/security.txt", "/site.webmanifest"]) {
      expect(gsc404Redirect(path)).toBeNull();
    }
  });

  it("the changelog links straight to the Transactions tab, not the /ledger redirect", () => {
    expect(JSON.stringify(CHANGELOG_ENTRIES)).not.toContain('"href":"/ledger"');
  });
});

describe("b62 TT P3: crypto count line", () => {
  it("always says Showing N of up to 400, including a full list", () => {
    expect(cryptoCountLine(400)).toBe("Showing 400 of up to 400");
    expect(cryptoCountLine(292)).toBe("Showing 292 of up to 400");
    expect(cryptoCountLine(900)).toBe("Showing 400 of up to 400");
    expect(cryptoCountLine(0)).toBe("The largest coins by market cap");
  });
  it("the explorer counts the whole list (server listCount), not the 25 shipped rows", () => {
    const src = read("src/components/dashboard/MarketsExplorer.tsx");
    expect(src).toContain("cryptoCountLine(cryptoFullList)");
    expect(src).toContain("seedCryptoTab?.listCount");
    expect(read("src/lib/public-market-index.ts")).toContain("listCount: coins.length");
  });
});

describe("b62 TT P2: /status DEX row", () => {
  const now = Date.parse("2026-10-23T00:30:00Z");
  it("shows the saved DEX time", () => {
    const row = dexStatusRow("2026-10-23T00:25:00Z", null, now);
    expect(row.label).toBe(DEX_STATUS_LABEL);
    expect(row.tone).toBe("ok");
    expect(row.text).toMatch(/1:25 pm/);
  });
  it("names a refresh that failed after the saved time", () => {
    const row = dexStatusRow("2026-10-22T13:02:00Z", { at: "2026-10-23T00:29:00Z", reason: "geckoterminal HTTP 429; dexpaprika returned no rows" }, now);
    expect(row.tone).toBe("red");
    expect(row.text).toContain("last refresh failed");
    expect(row.text).toContain("geckoterminal HTTP 429");
  });
  it("is wired into /status and a schedule calls the refresh route", () => {
    expect(read("src/lib/status-feeds.server.ts")).toContain("dexStatusRow(");
    const wf = read(".github/workflows/market-snapshot.yml");
    expect(wf).toContain("/api/cron/crypto-snapshot");
    expect(wf).not.toMatch(/echo.*\$\{?CRON_SECRET/);
  });
  it("pins the build", () => {
    expect(read("public/build-version.txt")).toContain("v3-dashclean-d-b82-2026-10-27");
  });
});
