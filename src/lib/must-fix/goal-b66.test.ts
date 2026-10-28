// pull-check:v3-b89-2026-10-29
/** Goal b66 = Batch S3 (G-27, G-28, G-29) + TT b64 P3s (DEX per-source report on the snapshot, /markets edge cache). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptShare,
  accessStatus,
  confirmShare,
  hashShareToken,
  liveStatus,
  makeViewDeduper,
  newShare,
  newShareToken,
  publicShare,
  requestAccess,
  revokeAllForOwner,
  revokeShare,
  sharedBookView,
  SHARE_LINK_TTL_MS,
} from "@/lib/sharing/share-core";
import { funnelRow, makeLimiter } from "@/lib/onboarding/funnel-core";
import { GAMBLING_WORDS, QUIZ_QUESTIONS, THIRTY_DAY_TASKS, serverFunnelEvent } from "@/lib/onboarding-30";
import { xeroAmount, xeroStatementCsv, xeroText, XERO_HEADERS } from "@/lib/xero-csv";
import { dexStatusRow } from "@/lib/status-feeds";
import { isCacheableMarketsPath, PUBLIC_MARKETS_CACHE_HEADERS } from "@/lib/private-document";
import { documentAccess } from "@/lib/route-gate";
import type { SnapshotLedgerLine } from "@/lib/portfolio-snapshot";

const read = (p: string) => readFileSync(p, "utf8");
const NOW = Date.parse("2026-10-24T06:00:00Z");

describe("b66 build", () => {
  it("build version", () => expect(read("public/build-version.txt").trim()).toBe("v3-b89-2026-10-29"));
});

describe("G-27 read-only share", () => {
  const base = async () => {
    const token = newShareToken();
    const share = newShare({ id: "s1", portfolioId: "main", ownerId: "owner", label: "accountant", tokenHash: await hashShareToken(token), now: NOW });
    return { token, share };
  };

  it("link: 32-byte token, only its SHA-256 stored, 7-day expiry", async () => {
    const { token, share } = await base();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(share.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(share)).not.toContain(token);
    expect(Date.parse(share.expires_at) - NOW).toBe(SHARE_LINK_TTL_MS);
    expect(publicShare(share)).not.toHaveProperty("token_hash");
    expect(JSON.stringify(publicShare(share))).not.toContain(share.token_hash);
  });

  it("single use, expires after 7 days, owner can't accept their own", async () => {
    const { share } = await base();
    const first = acceptShare(share, "inv", NOW);
    expect(first.ok).toBe(true);
    const used = first.ok ? first.share : share;
    expect(acceptShare(used, "other", NOW)).toEqual({ ok: false, reason: "used" });
    expect(acceptShare(share, "inv", NOW + SHARE_LINK_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
    expect(acceptShare(share, "owner", NOW)).toEqual({ ok: false, reason: "own" });
    expect(liveStatus(share, NOW + SHARE_LINK_TTL_MS + 1)).toBe("expired");
  });

  it("no access before the owner confirms; read-only after; 403 on writes; 404 unshared", async () => {
    const { share } = await base();
    const accepted = (acceptShare(share, "inv", NOW) as { ok: true; share: typeof share }).share;
    expect(requestAccess({ userId: "inv", share: accepted, ownerExists: true, now: NOW })).toBe("none");
    const active = confirmShare(accepted, "owner", NOW)!;
    expect(confirmShare(accepted, "inv", NOW)).toBeNull();
    const a = requestAccess({ userId: "inv", share: active, ownerExists: true, now: NOW });
    expect(accessStatus(a, false)).toBe(200);
    expect(accessStatus(a, true)).toBe(403);
    expect(accessStatus(requestAccess({ userId: "stranger", share: active, ownerExists: true, now: NOW }), false)).toBe(404);
    expect(accessStatus(requestAccess({ userId: "inv", share: undefined, ownerExists: true, now: NOW }), false)).toBe(404);
  });

  it("revoke is immediate (next request), and only the owner can revoke", async () => {
    const { share } = await base();
    const active = confirmShare((acceptShare(share, "inv", NOW) as { ok: true; share: typeof share }).share, "owner", NOW)!;
    expect(revokeShare(active, "inv", NOW)).toBeNull();
    const revoked = revokeShare(active, "owner", NOW + 500)!;
    const t0 = performance.now();
    expect(requestAccess({ userId: "inv", share: revoked, ownerExists: true, now: NOW + 600 })).toBe("none");
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("owner account deletion cuts access off even before rows are revoked, and revokes all", async () => {
    const { share } = await base();
    const active = confirmShare((acceptShare(share, "inv", NOW) as { ok: true; share: typeof share }).share, "owner", NOW)!;
    expect(requestAccess({ userId: "inv", share: active, ownerExists: false, now: NOW })).toBe("none");
    const all = revokeAllForOwner([active, { ...active, _id: "s2" }, { ...active, _id: "s3", owner: "someone-else" }], "owner", NOW);
    expect(all.map((s) => s._id)).toEqual(["s1", "s2"]);
    expect(all.every((s) => s.status === "revoked")).toBe(true);
  });

  it("view log is deduplicated per viewer per hour", () => {
    const once = makeViewDeduper();
    expect(once("s1", "inv", NOW)).toBe(true);
    expect(once("s1", "inv", NOW + 60_000)).toBe(false);
    expect(once("s1", "inv", NOW + 3_600_001)).toBe(true);
  });

  it("the shared book carries holdings and trades only (no ids, notes, cash, goals)", () => {
    const v = sharedBookView({
      stocks: [{ _id: "x", ticker: "FPH.NZ", company_name: "Fisher & Paykel", shares: 10, purchase_price: 30.5, notes: "private", user: "owner" }],
      metals: [{ _id: "m", metal: "gold", ounces: 1.5, purchase_price_per_oz: 4000 }],
      trades: [{ _id: "t", type: "buy", ticker: "FPH.NZ", quantity: 10, price: 30.5, executed_at: "2026-10-20T01:00:00Z", notes: "idem=abc" }],
    });
    const json = JSON.stringify(v);
    for (const leak of ["private", "idem=abc", "owner", '"x"', "_id"]) expect(json).not.toContain(leak);
    expect(v.holdings).toHaveLength(2);
    expect(v.trades[0]).toMatchObject({ date: "2026-10-20", type: "buy", quantity: 10 });
  });

  it("routes: flag-gated, no email, GET list + per-share read route refuses writes", () => {
    const route = read("src/app/api/share/route.ts");
    const one = read("src/app/api/share/[id]/route.ts");
    expect(route).toContain('flagOn("PORTFOLIO_SHARING")');
    expect(one).toContain('flagOn("PORTFOLIO_SHARING")');
    expect(route + one).not.toMatch(/sendMail|resend|nodemailer|sendEmail/i);
    expect(one).toMatch(/export const (POST|PUT|PATCH|DELETE) = refuseWrite/);
    expect(route + one).toContain("no-store");
    expect(read("src/app/settings/sharing/page.tsx")).toContain('flagOn("PORTFOLIO_SHARING")');
    expect(documentAccess("/shared")).toBe("member");
    expect(documentAccess("/share/accept")).toBe("public");
  });
});

describe("G-28 onboarding checklist and quiz", () => {
  it("one rate-limited write-only route; anonymous events need consent", () => {
    const route = read("src/app/api/onboarding/funnel/route.ts");
    expect(route).toMatch(/export async function POST/);
    expect(route).not.toMatch(/export async function GET/);
    const lim = makeLimiter(2, 60_000);
    expect([lim("k", 0), lim("k", 1), lim("k", 2)]).toEqual([true, true, false]);
    expect(funnelRow({ event: "view", userId: null, anonId: "A".repeat(24), consent: false })).toEqual({ write: false, reason: "no_consent" });
    expect(funnelRow({ event: "view", userId: null, anonId: "A".repeat(24), consent: true }).write).toBe(true);
  });

  it("client steps map to the server's event names", () => {
    expect(serverFunnelEvent("task_done", "import")).toEqual({ event: "checklist_step", stepKey: "import" });
    expect(serverFunnelEvent("quiz_result", "Starter")).toEqual({ event: "quiz_result", planResult: "starter" });
    expect(funnelRow({ ...serverFunnelEvent("quiz_result", "Starter"), userId: "u", anonId: null, consent: false }).write).toBe(true);
  });

  it("owner-only summary route returns counts only", () => {
    const admin = read("src/app/api/admin/onboarding-funnel/route.ts");
    expect(admin).toContain("PRIVACY_OFFICER_EMAIL");
    expect(admin).toMatch(/status: 404/);
    expect(admin).not.toMatch(/anon_id:|user:/);
  });

  it("no gambling-style wording", () => {
    const text = [...THIRTY_DAY_TASKS.map((t) => t.title), ...QUIZ_QUESTIONS.flatMap((q) => [q.text, ...q.options.map((o) => o[1])])].join(" ");
    expect(GAMBLING_WORDS.test(text)).toBe(false);
  });
});

describe("G-29 Xero bank-statement CSV", () => {
  const line = (p: Partial<SnapshotLedgerLine>): SnapshotLedgerLine =>
    ({ id: "t1", type: "buy", ticker: "FPH.NZ", quantity: 10, price: 30.5, feesNzd: 0, currency: "NZD", fx: 1, fxDisplay: "", cashNzd: -305, realisedNzd: null, when: "2026-10-20T01:00:00Z", whenLabel: "", ...p }) as SnapshotLedgerLine;

  it("Xero's published columns, DD/MM/YYYY, signed 2dp amounts with no symbols or separators", () => {
    expect(XERO_HEADERS).toEqual(["Date", "Amount", "Payee", "Description", "Reference"]);
    const { csv, rows } = xeroStatementCsv([line({}), line({ id: "t2", type: "deposit", ticker: "", quantity: null, price: null, cashNzd: 12345.678, when: "2026-10-01T00:00:00Z" })]);
    const out = csv.trim().split("\n");
    expect(rows).toBe(2);
    expect(out[0]).toBe("Date,Amount,Payee,Description,Reference");
    expect(out[1]).toBe("01/10/2026,12345.68,AetherForge paper book,Deposit,t2");
    expect(out[2]).toBe("20/10/2026,-305.00,AetherForge paper book,Buy FPH.NZ 10 @ 30.5 NZD,t1");
    for (const r of out.slice(1)) expect(r.split(",")[1]).toMatch(/^-?\d+\.\d{2}$/);
  });

  it("no formula injection, no line breaks, capped length; tiny or undated rows skipped", () => {
    expect(xeroText("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(xeroText("a\nb")).toBe("a b");
    expect(xeroText("x".repeat(400))).toHaveLength(255);
    expect(xeroAmount(-0.001)).toBe("0.00");
    const { rows, skipped } = xeroStatementCsv([line({ cashNzd: 0.004 }), line({ when: "" })]);
    expect([rows, skipped]).toEqual([0, 2]);
  });
});

describe("TT b64 P3: DEX per-source report saved with the snapshot", () => {
  it("snapshot encodes the report; /status reads it from the snapshot", () => {
    const snap = read("src/lib/crypto-snapshot.ts");
    expect(snap).toContain("export async function persistDexReport");
    expect(snap).toMatch(/report: cleanDexReport\(report\)/);
    const status = read("src/lib/status-feeds.server.ts");
    expect(status).toContain("snap?.report");
    expect(read("src/lib/crypto-board-store.ts")).toContain("persistDexReport(dexReportRows(), at)");
  });

  it("status row shows each source's note", () => {
    const row = dexStatusRow("2026-10-24T05:50:00Z", null, Date.parse("2026-10-24T06:00:00Z"), "GeckoTerminal: 0 rows; DexPaprika: 180 rows");
    expect(row.text).toContain("GeckoTerminal");
    expect(row.text).toContain("DexPaprika: 180 rows");
  });
});

describe("TT b64 P3: /markets TTFB edge cache, signed-out only", () => {
  it("s-maxage + stale-while-revalidate on /markets only", () => {
    expect(PUBLIC_MARKETS_CACHE_HEADERS["Cache-Control"]).toMatch(/public, max-age=0, s-maxage=\d+, stale-while-revalidate=\d+/);
    expect(isCacheableMarketsPath("/markets")).toBe(true);
    expect(isCacheableMarketsPath("/markets/")).toBe(true);
    expect(isCacheableMarketsPath("/markets/crypto/bitcoin")).toBe(false);
    expect(isCacheableMarketsPath("/dashboard")).toBe(false);
  });

  it("middleware applies it only when there is no session cookie", () => {
    const mw = read("src/middleware.ts");
    expect(mw).toContain("if (!signedIn && isCacheableMarketsPath(pathname)) return applyPublicMarketsCache(response);");
    expect(mw).toContain("return applyPrivateNoStore(response);");
  });
});
