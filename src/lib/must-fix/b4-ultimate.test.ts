import { describe, expect, it, vi } from "vitest";
import {
  canEdit, canRead, issueApiKey, rateLimitStep, API_RATE_LIMIT, rotateApiKey, rowsForPortfolio,
  seatInviteEmail, verifyApiKey, visiblePortfolios, type Portfolio, type Seat,
} from "@/lib/ultimate/core";

vi.mock("server-only", () => ({}));

const P = (id: string, owner = "adviser"): Portfolio => ({ id, ownerUserId: owner, name: id });
const portfolios = [P("p1"), P("p2"), P("p3"), P("other", "someone-else")];
const seats: Seat[] = [
  { portfolioId: "p1", userId: "viewer", role: "viewer" },
  { portfolioId: "p2", userId: "viewer", role: "viewer", revokedAt: "2026-10-01" },
];

describe("M-11 isolation", () => {
  it("owner sees their 3 portfolios, never another owner's", () => {
    expect(visiblePortfolios("adviser", portfolios, seats).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
  it("a viewer reads only the portfolio they hold a live seat on, and cannot edit", () => {
    expect(visiblePortfolios("viewer", portfolios, seats).map((p) => p.id)).toEqual(["p1"]);
    expect(canRead("viewer", portfolios[1], seats)).toBe(false);
    expect(canEdit("viewer", portfolios[0], seats)).toBe(false);
    expect(canEdit("adviser", portfolios[0], seats)).toBe(true);
  });
  it("rows from other portfolios never leak", () => {
    const rows = [{ portfolioId: "p1", x: 1 }, { portfolioId: "p2", x: 2 }, { portfolioId: "other", x: 3 }];
    expect(rowsForPortfolio("viewer", portfolios[0], seats, rows)).toEqual([{ portfolioId: "p1", x: 1 }]);
    expect(rowsForPortfolio("viewer", portfolios[3], seats, rows)).toBeNull();
    expect(rowsForPortfolio("stranger", portfolios[0], seats, rows)).toBeNull();
  });
});

describe("M-11 API keys", () => {
  it("valid key → owner; revoked or rotated-away key → null (401)", () => {
    const { secret, record } = issueApiKey("adviser");
    expect(record).not.toHaveProperty("secret");
    expect(record.hash).not.toContain(secret);
    expect(verifyApiKey(secret, [record])).toBe("adviser");
    const rotated = rotateApiKey(record);
    expect(verifyApiKey(secret, [rotated.revoked, rotated.record])).toBeNull();
    expect(verifyApiKey(rotated.secret, [rotated.revoked, rotated.record])).toBe("adviser");
    expect(verifyApiKey("afk_bad_key", [record])).toBeNull();
    expect(verifyApiKey(null, [record])).toBeNull();
  });
  it("rate limit: 60 a minute, then 429 with Retry-After", () => {
    const state = new Map();
    for (let i = 0; i < API_RATE_LIMIT.limit; i++) expect(rateLimitStep(state, "k", 1000).ok).toBe(true);
    const blocked = rateLimitStep(state, "k", 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    expect(rateLimitStep(state, "k", 61_000).ok).toBe(true);
  });
  it("invite email is a template only", () => {
    const e = seatInviteEmail({ ownerName: "Ann", portfolioName: "Client A", role: "viewer", acceptUrl: "https://example.test/accept" });
    expect(e.text).toContain("cannot change anything");
  });
});

describe("M-11 route is off by default", () => {
  it("404 with the flag off, and read-only", async () => {
    vi.doMock("@/lib/ultimate/store", () => ({ loadUltimateStore: async () => ({ portfolios: [], seats: [], keys: [] }) }));
    const route = await import("@/app/api/v1/portfolios/route");
    expect((await route.GET(new Request("http://t/api/v1/portfolios"))).status).toBe(404);
    expect(route.POST().status).toBe(405);
  });
  it("with the flag on: revoked key → 401, live key → only visible portfolios", async () => {
    vi.resetModules();
    vi.doMock("@/lib/feature-flags", () => ({ ULTIMATE_FEATURES: true }));
    const live = issueApiKey("viewer");
    const dead = issueApiKey("adviser");
    dead.record.revokedAt = "2026-10-10";
    vi.doMock("@/lib/ultimate/store", () => ({ loadUltimateStore: async () => ({ portfolios, seats, keys: [live.record, dead.record] }) }));
    const route = await import("@/app/api/v1/portfolios/route");
    const req = (k: string) => new Request("http://t/api/v1/portfolios", { headers: { authorization: `Bearer ${k}` } });
    expect((await route.GET(req(dead.secret))).status).toBe(401);
    const ok = await route.GET(req(live.secret));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual([{ id: "p1", name: "p1" }]);
  });
});
