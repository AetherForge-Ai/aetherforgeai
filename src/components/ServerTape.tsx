import { MarketTicker } from "@/components/MarketTicker";
import { loadServerTape } from "@/lib/tape-ssr";

/**
 * Compact tape for AppShell. The suspense fallback holds the band and does not
 * say "Close unavailable" — that phrase is only the resolved neutral fallback
 * when the snapshot has no quote time.
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
  const tape = await loadServerTape();
  return <MarketTicker compact initial={tape} serverNow={new Date().toISOString()} />;
}
