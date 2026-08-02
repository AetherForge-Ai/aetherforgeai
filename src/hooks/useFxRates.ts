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
export function useFxRates(): { rates: FxRatesToNZD; live: boolean } {
  const [rates, setRates] = useState<FxRatesToNZD>(BASELINE_FX_TO_NZD);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<{ ratesToNZD: FxRatesToNZD; live: boolean }>("/api/fx");
      if (active && res.ok && res.data?.ratesToNZD) {
        console.log("[useFxRates] FX rates loaded:", res.data.live ? "live" : "baseline", res.data.ratesToNZD);
        setRates(res.data.ratesToNZD);
        setLive(!!res.data.live);
      }
    })().catch((err) => console.error("[useFxRates] Failed to load FX rates, using baseline:", err));
    return () => {
      active = false;
    };
  }, []);

  return { rates, live };
}
