import { connection } from "next/server";
import { MarketTicker } from "@/components/MarketTicker";
import { loadRequestTape } from "@/lib/tape-ssr";

/**
 * Compact tape for AppShell. The suspense fallback holds the band. A resolved
 * tape with no stamped quote also stays on that pending state, so the HTML
 * never says "Close unavailable" before the client has a quote time.
 */
export function TapePending() {
  return (
    <div className="w-full border-y border-border/50" data-market-ticker="compact" data-tape-pending aria-busy="true">
      <div className="h-8 border-b border-emerald-500/20 bg-zinc-950" />
      <div className="min-h-[4.5rem] bg-zinc-950 md:min-h-[1.75rem]" />
    </div>
  );
}

export async function ServerTape() {
  // Per request. A static shell would render this at build time, when the edge
  // cache has no snapshot, and bake "Close unavailable" into the HTML.
  await connection();
  const tape = await loadRequestTape();
  return <MarketTicker compact initial={tape} serverNow={tape ? new Date().toISOString() : null} />;
}
