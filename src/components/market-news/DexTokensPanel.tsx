"use client";

/**
 * b88 MN-DEX-1: DEX tokens on /market-news. Visible at every width (no breakpoint hiding):
 * a stacked list on phones, two columns on tablets, three on laptops. Real rows only.
 */
import * as React from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { buildDexPanel, type DexPanel } from "@/lib/dex-news-panel";
import type { DexTokenRow } from "@/lib/crypto-dex";

export function DexTokensPanel({ initial }: { initial: DexPanel }) {
  const [panel, setPanel] = React.useState<DexPanel>(initial);
  React.useEffect(() => {
    if (initial.rows.length) return;
    let alive = true;
    fetch("/api/crypto/dex", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: DexTokenRow[]; printedAt?: string | null }>) : null))
      .then((j) => {
        if (alive && j && Array.isArray(j.data) && j.data.length) setPanel(buildDexPanel({ at: j.printedAt ?? null, rows: j.data }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initial.rows.length]);

  return (
    <section id="dex-tokens" data-dex-panel aria-labelledby="dex-tokens-heading" className="mt-8 block w-full rounded-2xl border border-border/60 bg-card/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dex-tokens-heading" className="flex items-center gap-2 font-display text-lg font-bold">
          <Layers className="size-5 text-primary" /> DEX tokens
        </h2>
        <Link href="/markets?tab=dex" className="text-sm font-semibold text-primary hover:underline">
          See all DEX tokens
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Top DEX tokens by 24-hour volume, in USD. {panel.line} Not financial advice.</p>
      {panel.rows.length ? (
        <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {panel.rows.map((r) => (
            <li key={r.id} data-dex-row className="min-w-0 rounded-xl border border-border/50 bg-background/40 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{r.symbol}</span>
                <span className="shrink-0 tabular-nums font-semibold">{r.price}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{r.name} · {r.network} · {r.dex}</span>
                <span className="shrink-0 tabular-nums">Vol {r.volume}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
