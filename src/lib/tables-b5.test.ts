import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ONBOARDING_FUNNEL_EVENT } from "@/lib/schema/onboarding-funnel.schema";
import { PORTFOLIO_SHARE, SHARE_AUDIT_EVENT } from "@/lib/schema/sharing.schema";
import { flagOn } from "@/lib/schema/types";
import { aggregate, funnelRow, makeLimiter, newAnonId } from "@/lib/onboarding/funnel-core";
import {
  acceptShare, accessStatus, canReadAuditLog, confirmShare, hashShareToken, newShare, newShareToken, portfolioAccess, revokeAllForOwner, revokeShare, SHARE_LINK_TTL_MS, truncateIp, type Share,
} from "@/lib/sharing/share-core";

const T0 = Date.parse("2026-10-21T00:00:00Z");

describe("G-27 schema (approved 20 Oct 2026 15:52 NZDT)", () => {
  it("tables and fields match the AC; additive; no auto fields", () => {
    expect(PORTFOLIO_SHARE.table).toBe("portfolio_share");
    expect(SHARE_AUDIT_EVENT.table).toBe("share_audit_event");
    for (const t of [PORTFOLIO_SHARE, SHARE_AUDIT_EVENT, ONBOARDING_FUNNEL_EVENT]) {
      expect(t.fields.some((f) => ["_id", "createdAt", "updatedAt"].includes(f.name))).toBe(false);
    }
    expect(PORTFOLIO_SHARE.indexes).toContainEqual({ fields: ["token_hash"], unique: true });
    expect(PORTFOLIO_SHARE.fields.find((f) => f.name === "status")?.options).toEqual(["pending", "accepted", "active", "revoked", "expired"]);
  });
});

describe("G-27 read-only share rules", () => {
  async function fresh(): Promise<{ share: Share; token: string }> {
    const token = newShareToken();
    return { token, share: { ...newShare({ id: "s1", portfolioId: "p1", ownerId: "owner", label: "accountant", tokenHash: await hashShareToken(token), now: T0 }) } };
  }
  it("token is crypto random; only the hash is stored", async () => {
    const { share, token } = await fresh();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(share.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(share)).not.toContain(token);
    expect(newShareToken()).not.toBe(token);
  });
  it("link works once and expires after 7 days; owner cannot accept own link", async () => {
    const { share } = await fresh();
    expect(acceptShare(share, "owner", T0)).toEqual({ ok: false, reason: "own" });
    expect(acceptShare(share, "inv", T0 + SHARE_LINK_TTL_MS)).toEqual({ ok: false, reason: "expired" });
    const a = acceptShare(share, "inv", T0 + 1000);
    expect(a.ok).toBe(true);
    if (a.ok) expect(acceptShare(a.share, "other", T0 + 2000)).toEqual({ ok: false, reason: "used" });
  });
  it("no access between accept and owner confirm; read-only after; writes 403; unshared 404", async () => {
    const { share } = await fresh();
    const a = acceptShare(share, "inv", T0);
    if (!a.ok) throw new Error("accept");
    const args = { userId: "inv", portfolioOwnerId: "owner", portfolioId: "p1", now: T0 };
    expect(portfolioAccess({ ...args, shares: [a.share] })).toBe("none");
    expect(confirmShare(a.share, "inv", T0)).toBeNull();
    const active = confirmShare(a.share, "owner", T0)!;
    expect(portfolioAccess({ ...args, shares: [active] })).toBe("read");
    expect(accessStatus("read", false)).toBe(200);
    expect(accessStatus("read", true)).toBe(403);
    expect(portfolioAccess({ ...args, portfolioId: "p2", shares: [active] })).toBe("none");
    expect(accessStatus("none", false)).toBe(404);
  });
  it("revoke is immediate on the next request; owner deletion revokes all", async () => {
    const { share } = await fresh();
    const a = acceptShare(share, "inv", T0);
    if (!a.ok) throw new Error("accept");
    const active = confirmShare(a.share, "owner", T0)!;
    const revoked = revokeShare(active, "owner", T0 + 10)!;
    expect(portfolioAccess({ userId: "inv", portfolioOwnerId: "owner", portfolioId: "p1", now: T0 + 11, shares: [revoked] })).toBe("none");
    expect(revokeShare(active, "inv", T0)).toBeNull();
    const all = revokeAllForOwner([active, { ...active, _id: "s2" }], "owner", T0);
    expect(all.every((s) => s.status === "revoked")).toBe(true);
  });
  it("audit log is owner-only; IP truncated", () => {
    expect(canReadAuditLog({ owner: "owner" }, "owner")).toBe(true);
    expect(canReadAuditLog({ owner: "owner" }, "inv")).toBe(false);
    expect(truncateIp("203.0.113.45")).toBe("203.0.113.0/24");
    expect(truncateIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
  });
  it("no email anywhere in the share path; no Math.random", () => {
    for (const f of ["src/lib/sharing/share-core.ts", "src/lib/sharing/share-store.server.ts", "src/app/api/share/route.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/sendMail|transactional-mail|resend|nodemailer/i);
      expect(s).not.toContain("Math.random");
    }
  });
});

describe("G-28 onboarding_funnel_event", () => {
  it("validated events; consent rule; signed-in still counts; no IP field", () => {
    expect(funnelRow({ event: "hack", userId: "u", anonId: null, consent: true })).toEqual({ write: false, reason: "bad_event" });
    expect(funnelRow({ event: "view", userId: null, anonId: newAnonId(), consent: false })).toEqual({ write: false, reason: "no_consent" });
    const anon = newAnonId();
    expect(funnelRow({ event: "quiz_start", userId: null, anonId: anon, consent: true })).toEqual({ write: true, row: { user: null, anon_id: anon, event: "quiz_start", step_key: "", plan_result: "" } });
    const signed = funnelRow({ event: "checklist_step", stepKey: "first_trade", userId: "u1", anonId: null, consent: false });
    expect(signed.write).toBe(true);
    expect(funnelRow({ event: "quiz_result", planResult: "<script>", userId: "u1", anonId: null, consent: true })).toEqual({ write: false, reason: "bad_field" });
    expect(ONBOARDING_FUNNEL_EVENT.fields.some((f) => /ip/i.test(f.name))).toBe(false);
  });
  it("each event counted once in the aggregate; rate limit", () => {
    const rows = (["view", "quiz_start", "quiz_result", "checklist_step"] as const).map((event) => ({ event }));
    expect(aggregate(rows)).toEqual({ view: 1, quiz_start: 1, quiz_result: 1, checklist_step: 1, signup: 0 });
    const lim = makeLimiter(2, 1000);
    expect([lim("k", 0), lim("k", 1), lim("k", 2), lim("k", 1001)]).toEqual([true, true, false, true]);
  });
  it("rollback flags: off unless exactly on", () => {
    expect(flagOn("ONBOARDING_FUNNEL_SERVER", {})).toBe(false);
    expect(flagOn("PORTFOLIO_SHARING", { PORTFOLIO_SHARING: "on" })).toBe(true);
    expect(readFileSync("src/app/api/onboarding/funnel/route.ts", "utf8")).toMatch(/status: 204/);
    expect(readFileSync("src/app/api/share/route.ts", "utf8")).toMatch(/featureOnFor\("PORTFOLIO_SHARING"/);
  });
});
