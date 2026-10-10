"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Bitcoin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoinDetailView } from "@/components/dashboard/crypto/CoinDetailView";
import { marketsTabHref, unavailableTokenLabel } from "@/lib/market-detail-routes";
import { openRecordTransaction } from "@/lib/open-transaction";
import { paperAddSignupHref } from "@/lib/paper-add-link";

/**
 * Full-page coin detail. The blocks match the old overlay; the URL is the page.
 */
export function CryptoAssetPage({
  coinId,
  allowBuy = false,
  signedIn = false,
  openFromQuery = false,
  market = "Crypto",
  unavailable = false,
  symbol = null,
  name = null,
}: {
  coinId: string | null;
  allowBuy?: boolean;
  signedIn?: boolean;
  /** True only when the page query is buy=1. */
  openFromQuery?: boolean;
  market?: "Crypto" | "DEX";
  unavailable?: boolean;
  symbol?: string | null;
  name?: string | null;
}) {
  const label = unavailable ? unavailableTokenLabel(symbol, name) : null;
  const dexMarket = unavailable ? "DEX" : market;
  const openedUnavailable = useRef(false);

  useEffect(() => {
    if (!signedIn || !openFromQuery || !unavailable || !symbol || openedUnavailable.current) return;
    openedUnavailable.current = true;
    openRecordTransaction({
      mode: "buy",
      preferredAssetType: "crypto",
      seed: {
        ticker: symbol,
        name: name || symbol,
        assetType: "crypto",
        market: "DEX",
      },
    });
  }, [signedIn, openFromQuery, unavailable, symbol, name]);

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
          <p className="text-sm font-semibold text-muted-foreground">Crypto markets</p>
          {label ? <p className="font-display text-lg font-semibold">{label}</p> : null}
        </div>
      </div>

      {unavailable && symbol ? (
        <div className="mt-4">
          {signedIn ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                openRecordTransaction({
                  mode: "buy",
                  preferredAssetType: "crypto",
                  seed: {
                    ticker: symbol,
                    name: name || symbol,
                    assetType: "crypto",
                    market: "DEX",
                  },
                })
              }
            >
              Add to paper book
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link
                href={paperAddSignupHref({
                  symbol,
                  name,
                  market: "DEX",
                })}
              >
                Add to paper book
              </Link>
            </Button>
          )}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-3xl border border-border/70 bg-card/50">
        <CoinDetailView
          coinId={coinId}
          allowBuy={allowBuy}
          signedIn={signedIn}
          openFromQuery={openFromQuery}
          paperMarket={dexMarket}
          unavailable={unavailable}
          variant="page"
        />
      </div>
    </div>
  );
}
