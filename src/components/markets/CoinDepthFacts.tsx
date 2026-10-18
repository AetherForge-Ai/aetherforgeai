"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { coinDepthViewModel, mergeCoinDepth } from "@/lib/crypto-depth-record";
import type { CoinDetail } from "@/lib/crypto-market";

/**
 * G-17 depth on the coin page. The first HTML uses the server record.
 * A later response can fill a hole. A price-only response cannot clear the fields.
 */
export function CoinDepthFacts({
  detail,
  coinId,
}: {
  detail: CoinDetail | null;
  coinId: string | null;
}) {
  const [row, setRow] = useState<CoinDetail | null>(detail);

  useEffect(() => {
    setRow(detail);
  }, [detail]);

  useEffect(() => {
    if (!coinId) return;
    let cancelled = false;
    void api
      .get<CoinDetail>(`/api/crypto/coin/${encodeURIComponent(coinId)}`, { signal: AbortSignal.timeout(8_000) })
      .then((res) => {
        if (cancelled || !res.ok || !res.data) return;
        setRow((prev) => mergeCoinDepth(res.data, prev) ?? res.data ?? prev);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [coinId]);

  const model = coinDepthViewModel(row, row?.checkedAt);
  return (
    <section className="mt-4" data-coin-depth>
      <p className="text-[0.7rem] text-muted-foreground" data-coin-metrics-source>
        {model.sourceLine}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {model.fields.map((field) => (
          <div key={field.key} className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5" data-depth-field={field.key}>
            <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{field.label}</p>
            <p className={field.missing ? "mt-0.5 text-xs text-muted-foreground" : "tnum mt-0.5 text-sm font-semibold"}>{field.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
