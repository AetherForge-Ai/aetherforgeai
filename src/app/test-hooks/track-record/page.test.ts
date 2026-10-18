import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({
  allow: true,
  body: { kind: "missing" as string, error: "", view: null as null | Record<string, unknown> },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/test-hooks.server", () => ({
  currentUserMayUseTestHooks: async () => gate.allow,
}));
vi.mock("@/lib/track-record-store.server", () => ({
  loadTrackRecordView: async () => {
    if (gate.body.kind === "ready") return { kind: "ready", view: gate.body.view };
    if (gate.body.kind === "error") return { kind: "error", error: gate.body.error };
    return { kind: "missing" };
  },
}));

import Page from "@/app/test-hooks/track-record/page";

const view = {
  storedAt: "2026-10-18T01:00:00.000Z",
  reportsRead: 4,
  laterFetched: 1,
  laterReused: 0,
  week: "2026-10-18",
  calls: 3,
  hits: 0,
  misses: 1,
  pending: 1,
  unscored: 1,
  scorecardHash: "ab".repeat(32),
  verifiedOk: 3,
  verifiedTotal: 3,
  hashMatches: true,
  totalsAddUp: true,
};

describe("track record page markup", () => {
  it("renders stored totals, the hash and the recomputed verifier", async () => {
    gate.allow = true;
    gate.body = { kind: "ready", error: "", view };
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-misses="1"');
    expect(html).toContain('data-hits="0"');
    expect(html).toContain('data-calls="3"');
    expect(html).toContain('data-hash-matches="yes"');
    expect(html).toContain(`data-scorecard-hash="${view.scorecardHash}"`);
    expect(html).toContain("Recomputed now: matches");
    expect(html).toContain("misses included");
    expect(html).toContain("3 of 3");
    expect(html).not.toContain("SECRET.NZ");
    expect(html).not.toContain("Could not build the scorecard");
  });

  it("a stored card with no scored calls shows the collected counts", async () => {
    gate.allow = true;
    gate.body = { kind: "ready", error: "", view: { ...view, calls: 2, hits: 0, misses: 0, pending: 2, unscored: 0, totalsAddUp: true } };
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-misses="0"');
    expect(html).toContain('data-pending="2"');
    expect(html).toContain("collected so far");
    expect(html).toContain("Recomputed now: matches");
  });

  it("shows no counts when nothing has been stored", async () => {
    gate.allow = true;
    gate.body = { kind: "missing", error: "", view: null };
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("No scorecard is stored yet");
    expect(html).not.toContain("data-hits");
    expect(html).not.toContain("data-scorecard-hash");
    expect(html).not.toContain("SECRET.NZ");
  });

  it("signed out throws notFound before any scorecard markup", async () => {
    gate.allow = false;
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
