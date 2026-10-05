"use client";

import Link from "next/link";
import { ArrowLeft, Bitcoin } from "lucide-react";
import { CoinDetailView } from "@/components/dashboard/crypto/CoinDetailView";
import { marketsTabHref, unavailableTokenLabel } from "@/lib/market-detail-routes";

/**
 * Full-page coin detail. The blocks match the old overlay; the URL is the page.
 */
export function CryptoAssetPage({
  coinId,
  allowBuy = false,
  unavailable = false,
  symbol = null,
  name = null,
}: {
  coinId: string | null;
  allowBuy?: boolean;
  unavailable?: boolean;
  symbol?: string | null;
  name?: string | null;
}) {
  const label = unavailable ? unavailableTokenLabel(symbol, name) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={marketsTabHref("CRYPTO")}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" /> Markets · Crypto
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Bitcoin className="size-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Stock Markets</p>
          {label ? <p className="font-display text-lg font-semibold">{label}</p> : null}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-border/70 bg-card/50">
        <CoinDetailView coinId={coinId} allowBuy={allowBuy} unavailable={unavailable} variant="page" />
      </div>
    </div>
  );
}
