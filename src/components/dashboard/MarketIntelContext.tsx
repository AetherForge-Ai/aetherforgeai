"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { getMarketNews, type NewsItem, type SecurityIntel } from "@/lib/market-intel";

interface MarketIntelState {
  /** Analysed universe — live-anchored when a data key is set, else deterministic. */
  universe: SecurityIntel[] | null;
  news: NewsItem[];
  live: boolean;
  loading: boolean;
}

const MarketIntelCtx = createContext<MarketIntelState>({
  universe: null,
  news: getMarketNews(),
  live: false,
  loading: true,
});

export function useMarketIntel(): MarketIntelState {
  return useContext(MarketIntelCtx);
}

export function MarketIntelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MarketIntelState>({
    universe: null,
    news: getMarketNews(),
    live: false,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<{ live: boolean; universe: SecurityIntel[]; news: NewsItem[] }>("/api/market");
      if (!active) return;
      if (res.ok && res.data) {
        setState({ universe: res.data.universe, news: res.data.news, live: res.data.live, loading: false });
        console.log(`[market-intel] Loaded ${res.data.universe.length} securities (live: ${res.data.live})`);
      } else {
        // Deterministic fallback — components compute from the local pure engine.
        console.error("[market-intel] Failed to load /api/market, using local engine:", res.error);
        setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return <MarketIntelCtx.Provider value={state}>{children}</MarketIntelCtx.Provider>;
}
