import { NextResponse } from "next/server";
import { getShowcaseDesign } from "../../../../../../assets/websiteDesignShowcase";
import { getCurrentUser } from "@/lib/session";

/**
 * Serves the raw, self-contained HTML document for a single showcase design.
 *
 * The design is rendered exactly as delivered, with one addition: a subtle
 * floating "Back to AetherForge" pill is injected before </body> so a visitor
 * viewing the demo can always return to the AetherForge site — the home page
 * for guests, or the members dashboard when signed in.
 *
 * Pass ?preview=1 to render the pristine design with NO injected pill
 * (used for the small non-interactive gallery thumbnails).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const design = getShowcaseDesign(slug);

  if (!design) {
    console.warn(`[showcase/raw] Unknown design slug requested: ${slug}`);
    return new NextResponse("Design not found", { status: 404 });
  }

  const isPreview = new URL(request.url).searchParams.get("preview") === "1";

  let html = design.html;

  if (!isPreview) {
    // Resolve where "back" should point: dashboard for members, home for guests.
    let backHref = "/";
    let backLabel = "Back to AetherForge";
    try {
      const user = await getCurrentUser();
      if (user) {
        backHref = "/dashboard";
        backLabel = "Back to your dashboard";
      }
    } catch (err) {
      // Non-critical: fall back to the public home link if session lookup fails.
      console.error("[showcase/raw] Failed to resolve current user:", err);
    }

    const backPill = `
<a href="${backHref}"
   style="position:fixed;left:16px;bottom:16px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:rgba(9,9,11,0.88);color:#fafafa;font:600 13px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-decoration:none;border:1px solid rgba(255,255,255,0.16);box-shadow:0 10px 30px -10px rgba(0,0,0,0.6);backdrop-filter:blur(8px);transition:transform .15s ease,background .15s ease;"
   onmouseover="this.style.transform='translateY(-2px)';this.style.background='rgba(9,9,11,0.96)';"
   onmouseout="this.style.transform='none';this.style.background='rgba(9,9,11,0.88)';">
  <span style="font-size:15px;line-height:1;">←</span>
  <span>${backLabel} · AetherForge</span>
</a>`;

    html = html.includes("</body>")
      ? html.replace("</body>", `${backPill}\n</body>`)
      : html + backPill;
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // These demos are static; allow short caching but keep it fresh.
      "Cache-Control": "public, max-age=60",
    },
  });
}
