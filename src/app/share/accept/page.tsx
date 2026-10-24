import { notFound } from "next/navigation";
import { AcceptShare } from "@/components/sharing/AcceptShare";
import { flagOn } from "@/lib/schema/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared book invite · AetherForge AI", robots: { index: false, follow: false } };

/** b66 G-27: copy-link invite landing. Behind PORTFOLIO_SHARING=on (off = 404). */
export default function AcceptSharePage() {
  if (!flagOn("PORTFOLIO_SHARING")) notFound();
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
