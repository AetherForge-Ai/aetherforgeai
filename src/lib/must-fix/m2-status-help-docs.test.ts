import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("M-2 /status times", () => {
  it("formats NZ time with the zone", async () => {
    const { formatStatusTime } = await import("@/lib/status-feeds");
    expect(formatStatusTime("2026-10-21T20:18:00Z")).toBe("22 Oct 2026, 9:18 am NZDT");
    expect(formatStatusTime("2026-06-01T00:05:00Z")).toBe("1 Jun 2026, 12:05 pm NZST");
    expect(formatStatusTime(null)).toBe("—");
  });

  it("a healthy row reads 'Last OK <time> NZDT' with no extra NZ-time suffix", async () => {
    const { shapeStatusFeed, statusFeedBody } = await import("@/lib/status-feeds");
    const now = Date.parse("2026-10-21T20:20:00Z");
    const row = shapeStatusFeed({ label: "FX", at: "2026-10-21T20:18:00Z", now, amberMs: 3_600_000, redMs: 86_400_000 });
    expect(statusFeedBody(row)).toBe("Last OK 22 Oct 2026, 9:18 am NZDT");
  });

  it("a saved equity time is a Last OK line, not 'no saved quote time yet'", async () => {
    const { statusSavedLabel, statusFeedBody } = await import("@/lib/status-feeds");
    const text = statusSavedLabel("2026-10-21T03:00:00Z");
    expect(statusFeedBody({ label: "Equity quotes", tone: "amber", text })).toBe("Last OK 21 Oct 2026, 4:00 pm NZDT · saved quote time");
  });

  it("the equity row falls back to the ticker snapshot quotedAt and the durable store", () => {
    const s = read("src/lib/status-feeds.server.ts");
    expect(s).toMatch(/lastGoodEquityAt\(\)/);
    expect(s).toMatch(/readStatusLastOk\(\)/);
    expect(s).toMatch(/saveStatusLastOk\(key, at\)/);
  });
});

describe("M-2 durable last-OK store (existing watchlist table, no new table)", () => {
  it("parses only valid times and keeps the newer one per feed", async () => {
    const { parseStatusLastOk, mergeStatusLastOk, STATUS_LAST_OK_TICKER } = await import("@/lib/status-last-ok.server");
    expect(STATUS_LAST_OK_TICKER).toBe("AF-SLO");
    expect(parseStatusLastOk('{"equity":"2026-10-21T03:00:00Z","fx":"nope","x":3}')).toEqual({ equity: "2026-10-21T03:00:00Z" });
    expect(parseStatusLastOk("not json")).toEqual({});
    expect(mergeStatusLastOk({ equity: "2026-10-21T03:00:00Z" }, { equity: "2026-10-20T03:00:00Z", fx: "2026-10-21T01:00:00Z" })).toEqual({
      equity: "2026-10-21T03:00:00Z",
      fx: "2026-10-21T01:00:00Z",
    });
    const src = read("src/lib/status-last-ok.server.ts");
    expect(src).toMatch(/crud\.(query|createRecord|editRecordById)\("watchlist"/);
    expect(src).not.toMatch(/createTable|crud\.\w+\("(?!watchlist)/);
  });
  it("the store row is hidden from member watchlists", () => {
    expect(read("src/lib/crypto-snapshot.ts")).toMatch(/key === "AF-SLO"/);
  });
});

describe("M-2 /help, /docs, /changelog", () => {
  it("/help shows admin@aetherforgeai.co.nz as plain text (no mailto link)", () => {
    const s = read("src/app/help/page.tsx");
    expect(s).toMatch(/admin<span>@<\/span>aetherforgeai\.co\.nz/);
    expect(s).not.toMatch(/mailto:|<EmailAddress/);
  });
  it("/docs has 6+ guides, each with a real screenshot file", async () => {
    const { DOCS_GUIDES, docsShot } = await import("@/lib/docs-guides");
    expect(DOCS_GUIDES.length).toBeGreaterThanOrEqual(6);
    for (const g of DOCS_GUIDES) {
      const shot = docsShot(g.slug);
      expect(shot, g.slug).not.toBeNull();
      expect(existsSync(path.join(process.cwd(), "public", shot!.src)), shot!.src).toBe(true);
    }
  });
  it("/docs links point at routes that exist", async () => {
    const { DOC_LINKS } = await import("@/lib/help-index");
    for (const l of DOC_LINKS) {
      const route = l.href.split("#")[0].replace(/^\//, "");
      expect(existsSync(path.join(process.cwd(), "src/app", route, "page.tsx")), l.href).toBe(true);
    }
  });
  it("the changelog shows no commit hashes or PR numbers", async () => {
    const { CHANGELOG_ENTRIES } = await import("@/lib/changelog-entries");
    for (const e of CHANGELOG_ENTRIES) {
      const text = `${e.title} ${e.body}`;
      expect(text).not.toMatch(/\b[0-9a-f]{7,40}\b/);
      expect(text).not.toMatch(/(?:PR\s*)?#\d{2,}/);
    }
  });
});
