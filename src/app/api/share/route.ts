import { NextResponse } from "next/server";
import { flagOn } from "@/lib/schema/types";
import { getStableSessionUser } from "@/lib/session";
import { acceptShare, canReadAuditLog, confirmShare, hashShareToken, newShare, newShareToken, revokeShare, truncateIp } from "@/lib/sharing/share-core";
import { auditFor, createShareRow, logShareEvent, sharesFor, updateShareRow } from "@/lib/sharing/share-store.server";

export const dynamic = "force-dynamic";

/**
 * G-27 read-only sharing. POST {action}: create | accept | confirm | revoke | log.
 * Behind PORTFOLIO_SHARING=on (off = 404, the rollback). Copy-link only: no email is sent.
 * The raw token is returned once on create and never logged or stored.
 */
export async function POST(req: Request) {
  if (!flagOn("PORTFOLIO_SHARING")) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const user = await getStableSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");
  const now = Date.now();
  const ip = truncateIp(req.headers.get("cf-connecting-ip"));
  try {
    if (action === "create") {
      const portfolioId = String(body.portfolioId || "main");
      const label = body.label === "accountant" ? "accountant" : "family";
      const token = newShareToken();
      const share = newShare({ id: "", portfolioId, ownerId: user._id, label, tokenHash: await hashShareToken(token), now });
      const { _id: _omit, ...row } = share;
      void _omit;
      const id = await createShareRow(row);
      await logShareEvent({ share: id, portfolio_id: portfolioId, actor: user._id, event: "link_created", ip_trunc: ip });
      return NextResponse.json({ ok: true, data: { id, link: `/share/accept#${token}`, expiresAt: share.expires_at } }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "accept") {
      const tokenHash = await hashShareToken(String(body.token || ""));
      const share = (await sharesFor({ token_hash: tokenHash }))[0];
      if (!share) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
      const out = acceptShare(share, user._id, now);
      if (!out.ok || !("share" in out)) return NextResponse.json({ ok: false, error: `This link cannot be used (${"reason" in out ? out.reason : "invalid"}).` }, { status: 410 });
      await updateShareRow(share._id, { invitee: out.share.invitee, status: "accepted" });
      await logShareEvent({ share: share._id, portfolio_id: share.portfolio_id, actor: user._id, event: "accept", ip_trunc: ip });
      return NextResponse.json({ ok: true, data: { status: "accepted" } });
    }
    const id = String(body.shareId || "");
    const share = (await sharesFor({ owner: user._id })).find((s) => s._id === id);
    if (!share) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    if (action === "confirm") {
      const next = confirmShare(share, user._id, now);
      if (!next) return NextResponse.json({ ok: false, error: "Nothing to confirm." }, { status: 409 });
      await updateShareRow(id, { status: "active", confirmed_at: next.confirmed_at });
      await logShareEvent({ share: id, portfolio_id: share.portfolio_id, actor: user._id, event: "confirm", ip_trunc: ip });
      return NextResponse.json({ ok: true, data: { status: "active" } });
    }
    if (action === "revoke") {
      const next = revokeShare(share, user._id, now);
      if (!next) return NextResponse.json({ ok: false, error: "Already revoked." }, { status: 409 });
      await updateShareRow(id, { status: "revoked", revoked_at: next.revoked_at });
      await logShareEvent({ share: id, portfolio_id: share.portfolio_id, actor: user._id, event: "revoke", ip_trunc: ip });
      return NextResponse.json({ ok: true, data: { status: "revoked" } });
    }
    if (action === "log") {
      if (!canReadAuditLog(share, user._id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, data: await auditFor(id) }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch {
    console.error("[api/share] error", action);
    return NextResponse.json({ ok: false, error: "Sharing is unavailable just now." }, { status: 503 });
  }
}
