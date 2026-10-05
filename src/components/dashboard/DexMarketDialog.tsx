"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { clientFacingError } from "@/lib/api-json";
import { fmtPrice, resolvableCoinId } from "@/lib/crypto-market";
import { cryptoDetailHref, unavailableCryptoHref } from "@/lib/market-detail-routes";
import type { DexTokenRow } from "@/lib/crypto-dex";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * Live decentralized-token list. A missing print is labelled unavailable.
 */
function dexDetailHref(row: DexTokenRow, allowBuy: boolean): string {
  const id = resolvableCoinId(row.detailId);
  if (!id) return unavailableCryptoHref({ symbol: row.symbol, name: row.name });
  return cryptoDetailHref(id, { buy: allowBuy });
}

export function DexMarketDialog({
  open,
  onOpenChange,
  allowBuy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dashboard explorer keeps Buy on the detail page. Public /markets does not. */
  allowBuy?: boolean;
}) {
  const [rows, setRows] = useState<DexTokenRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(initial: boolean) {
      if (initial) setLoading(true);
      const res = await api.get<DexTokenRow[]>("/api/crypto/dex");
      if (cancelled) return;
      if (initial) setLoading(false);
      if (res.ok && Array.isArray(res.data)) {
        setRows(res.data);
        setNotice(typeof res.notice === "string" ? res.notice : null);
        setError(null);
        if (res.data.length < 400) timer = setTimeout(() => void load(false), 2_000);
        return;
      }
      setRows([]);
      setNotice(null);
      setError(clientFacingError("/api/crypto/dex", res.error || "Live decentralized-token prices are unavailable."));
    }

    void load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, refreshTick]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Top Decentralized Exchanges Ranked by 24 Hours of Market</DialogTitle>
              <DialogDescription>
                Live pool prices for decentralized tokens. A missing print is unavailable.
                {notice ? ` ${notice}` : ""}
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshTick((tick) => tick + 1)}
              disabled={loading}
              className="shrink-0 gap-1.5"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Refresh
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading && rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading live decentralized-token prices…
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading live decentralized-token prices…
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Token</th>
                  <th className="py-2 pr-3 font-medium">Network</th>
                  <th className="py-2 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.symbol}-${row.id}`} className="border-t border-border/40">
                    <td className="py-2 pr-3">
                      <Link
                        href={dexDetailHref(row, allowBuy)}
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {row.symbol}
                      </Link>
                      <span className="ml-2 text-muted-foreground">{row.name}</span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.network || "Unavailable"}</td>
                    <td className="tnum py-2 text-right">
                      {row.priceUnavailable || !(row.price != null && row.price > 0) ? "Unavailable" : fmtPrice(row.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
