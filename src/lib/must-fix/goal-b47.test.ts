// pull-check:v3-goal-b47-2026-10-19
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const route = () => read("src/app/api/ticker/route.ts");

describe("b47 H-1 (a): colo copies are written under waitUntil; a last stored-copy read before any 503", () => {
  it("no colo put is fire-and-forget", () => {
    expect(route()).not.toMatch(/\n\s*void edge(SnapshotPut|JsonPut)\(/);
    expect(route().match(/void keepAlive\(edge(SnapshotPut|JsonPut)\(/g)?.length).toBe(3);
    expect(read("src/lib/status-feeds.server.ts")).toContain("void keepAlive(cache.put(");
  });
  it("reads the stored copy with the time left before 503", () => {
    expect(route()).toContain("LAST_RESORT_END_MS = 4_850");
    expect(route()).toContain("path=late-durable");
    expect(route().indexOf("path=late-durable")).toBeLessThan(route().indexOf("503 path=no-copy-anywhere"));
  });
});

describe("b47 H-1 (c): floor version from the colo, then the stored copy, then a short hold", () => {
  it("floorSnapshot falls back to the DB copy and holds", () => {
    const r = route();
    expect(r).toContain("readCryptoSnapshot(1_500, { floor })");
    expect(r).toContain("FLOOR_HOLD_MS = 1_000");
  });
});

describe("b47 freeze: refresh kicked at 5 minutes from the tape", () => {
  it("ticker kicks a single-flight refresh past 5 min", () => {
    expect(read("src/lib/crypto-board-store.ts")).toContain("SNAPSHOT_REFRESH_TRIGGER_MS = 5 * 60 * 1000");
    expect(route()).toContain("kickCryptoRefreshIfOld(snap.at)");
  });
});

describe("b47 P3", () => {
  it("308 for /compare, en-NZ date field, no beforeunload on sign-out", () => {
    expect(read("src/app/compare/page.tsx")).toContain("permanentRedirect(");
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain('lang="en-NZ"');
    expect(read("src/lib/sign-out.ts")).not.toContain("beforeunload\", ");
  });
  it("build marker", () => {
    expect(read("public/build-version.txt")).toContain("v3-m7-b74-2026-10-27");
  });
});
