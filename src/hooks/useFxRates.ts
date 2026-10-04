"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BASELINE_FX_TO_NZD, type FxRatesToNZD } from "@/lib/currency";

/**
 * Client hook that resolves live "1 unit → NZD" FX rates from `/api/fx`.
 *
 * Starts from the baseline table so prices render instantly (no layout shift),
 * then swaps in the live rates once they load. Never throws — falls back to the
 * baseline on any failure. Used to show the "≈ US$X" reference next to every
 * NZD price across the pricing, bot-purchase and billing screens.
 */
export function useFxRates(): {
  rates: FxRatesToNZD;
  live: boolean;
  asOf: string | null;
  /** False until /api/fx answers, so the page does not paint a second baseline rate as "today". */
  ready: boolean;
} {
  const [rates, setRates] = useState<FxRatesToNZD>(BASELINE_FX_TO_NZD);
  const [live, setLive] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<{ ratesToNZD: FxRatesToNZD; live: boolean; asOf?: string }>("/api/fx");
      if (!active) return;
      if (res.ok && res.data?.ratesToNZD && res.data.live && res.data.asOf) {
        console.log("[useFxRates] FX rates loaded:", res.data.ratesToNZD);
        setRates(res.data.ratesToNZD);
        setLive(true);
        setAsOf(res.data.asOf);
      } else {
        console.error("[useFxRates] No live FX snapshot; US$ figures stay blank:", res.error);
        setLive(false);
        setAsOf(null);
      }
      setReady(true);
    })().catch((err) => {
      console.error("[useFxRates] Failed to load FX rates; US$ figures stay blank:", err);
      if (!active) return;
      setLive(false);
      setAsOf(null);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { rates, live, asOf, ready };
}
