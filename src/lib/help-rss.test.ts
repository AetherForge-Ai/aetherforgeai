import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG_ENTRIES } from "@/app/changelog/page";
import { GET } from "@/app/rss.xml/route";
import { searchHelp } from "@/lib/help-index";
import { documentAccess } from "@/lib/route-gate";
import sitemap from "@/app/sitemap";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("help and changelog RSS", () => {
  it("searches docs and questions and publishes a valid RSS feed", async () => {
    expect(documentAccess("/help")).toBe("public");
    expect(searchHelp("privacy")[0]?.href).toBe("/privacy-policy");
    expect(searchHelp("refund").some((article) => article.title === "Do you offer refunds?")).toBe(true);
    expect(searchHelp("no-such-note")).toEqual([]);

    const help = read("src/app/help/page.tsx");
    expect(help).not.toMatch(/\bSLA\b|within \d+ (hour|day)/i);
    expect(help).toContain("admin@aetherforgeai.co.nz");

    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await response.text();
    expect(xml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")).toBe(true);
    expect(xml).toContain("<rss version=\"2.0\">");
    expect(xml).toContain("</rss>");
    expect(xml.match(/<item>/g)).toHaveLength(CHANGELOG_ENTRIES.length);
    expect(xml).toContain("11 Oct 2026");
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;)/);

    const rows = sitemap();
    expect(rows.some((row) => new URL(row.url).pathname === "/help")).toBe(true);
    expect(read("src/lib/help-index.ts")).toContain("pull-check:batch2-2026-10-11 B2-12");
  });
});
