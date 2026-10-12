import type { Metadata } from "next";
import { OfflineStamp } from "@/app/offline/offline-stamp";

export const metadata: Metadata = {
  title: "Saved shell · AetherForge AI",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-3xl font-bold">Saved shell</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Last updated <OfflineStamp />. This saved shell is stale until the connection returns. Holdings are not stored
        on this page.
      </p>
    </main>
  );
}
