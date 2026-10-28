import { NextResponse } from "next/server";
import { featureOnFor, storageUnavailable } from "@/lib/preview-grading";
import { getStableSessionUser } from "@/lib/session";
import { accessStatus, makeViewDeduper, requestAccess, sharedBookView, truncateIp } from "@/lib/sharing/share-core";
import { loadOwnerBookRows, logShareEvent, ownerExists, sharesFor } from "@/lib/sharing/share-store.server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const viewOnce = makeViewDeduper();
const notFound = () => NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers: NO_STORE });

/**
 * b66 G-27 GET /api/share/[id]: the read-only book behind one active share.
 * The share row and the owner account are read fresh on every request (no cache), so a revoke or an
 * owner account deletion takes effect on the invitee's next request. Anything not shared is 404.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getStableSessionUser().catch(() => null);
  if (!featureOnFor("PORTFOLIO_SHARING", user)) return notFound();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  try {
    const share = (await sharesFor({ invitee: user._id })).find((s) => s._id === id);
    const access = requestAccess({ userId: user._id, share, ownerExists: share ? await ownerExists(share.owner) : false, now: Date.now() });
    if (accessStatus(access, false) !== 200 || !share) return notFound();
    const view = sharedBookView(await loadOwnerBookRows(share.owner));
    if (viewOnce(share._id, user._id)) {
      await logShareEvent({ share: share._id, portfolio_id: share.portfolio_id, actor: user._id, event: "view", ip_trunc: truncateIp(req.headers.get("cf-connecting-ip")) });
    }
    return NextResponse.json({ ok: true, data: { label: share.label, portfolioId: share.portfolio_id, readOnly: true, ...view } }, { headers: NO_STORE });
  } catch (err) {
    console.error("[api/share/id] read failed");
    const u = storageUnavailable("Sharing", "portfolio_share", err);
    return NextResponse.json({ ok: false, error: u.error }, { status: u.status, headers: NO_STORE });
  }
}

/** Every write through a share is refused: 403 for an active invitee, 404 for anyone else. */
async function refuseWrite(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getStableSessionUser().catch(() => null);
  if (!featureOnFor("PORTFOLIO_SHARING", user)) return notFound();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  try {
    const share = (await sharesFor({ invitee: user._id })).find((s) => s._id === id);
    const access = requestAccess({ userId: user._id, share, ownerExists: share ? await ownerExists(share.owner) : false, now: Date.now() });
    const status = accessStatus(access, true);
    if (status === 403) return NextResponse.json({ ok: false, error: "This share is read-only." }, { status: 403, headers: NO_STORE });
    return notFound();
  } catch {
    return notFound();
  }
}

export const POST = refuseWrite;
export const PUT = refuseWrite;
export const PATCH = refuseWrite;
export const DELETE = refuseWrite;
