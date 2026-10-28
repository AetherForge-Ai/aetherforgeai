import { notFound } from "next/navigation";
import { AcceptShare } from "@/components/sharing/AcceptShare";
import { featureOnFor } from "@/lib/preview-grading";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared book invite · AetherForge AI", robots: { index: false, follow: false } };

/** b66 G-27: copy-link invite landing. Behind PORTFOLIO_SHARING=on (off = 404). */
export default async function AcceptSharePage() {
  // b91 G-27: flag off = 404, except for a signed-in allow-listed test account (preview grading).
  const user = await getCurrentUser().catch(() => null);
  if (!featureOnFor("PORTFOLIO_SHARING", user as never)) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">Shared book invite</h1>
      <p className="mt-2 text-sm text-muted-foreground">Someone has shared their AetherForge paper book with you, read-only.</p>
      <div className="mt-4">
        <AcceptShare />
      </div>
    </main>
  );
}
