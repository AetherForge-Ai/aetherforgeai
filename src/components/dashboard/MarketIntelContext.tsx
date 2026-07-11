"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { getMarketNews, type AssetClass, type NewsItem, type SecurityIntel } from "@/lib/market-intel";

interface MarketIntelState {
  /** Analysed universe — live-anchored when a data key is set, else deterministic. */
  universe: SecurityIntel[] | null;
  news: NewsItem[];
  live: boolean;
  loading: boolean;
  /** True only while a manual refresh (not the first load) is in flight. */
  refreshing: boolean;
  /** ISO timestamp of the last successful universe load. */
  lastUpdated: string | null;
  bot: AssetClass;
  /** Re-pull the live universe from /api/market on demand. */
  refresh: () => void;
}

const MarketIntelCtx = createContext<MarketIntelState>({
  universe: null,
  news: getMarketNews(),
  live: false,
  loading: true,
  refreshing: false,
  lastUpdated: null,
  bot: "stock",
  refresh: () => {},
});

export function useMarketIntel(): MarketIntelState {
  return useContext(MarketIntelCtx);
}

export function MarketIntelProvider({ bot = "stock", children }: { bot?: AssetClass; children: ReactNode }) {
  const [universe, setUniverse] = useState<SecurityIntel[] | null>(null);
  const [news, setNews] = useState<NewsItem[]>(getMarketNews(bot));
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const activeRef = useRef(true);

  const load = useCallback(
    async (isManual: boolean) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      const res = await api.get<{ live: boolean; universe: SecurityIntel[]; news: NewsItem[] }>(
        `/api/market?bot=${bot}&t=${Date.now()}`
      );
      if (!activeRef.current) return;
      if (res.ok && res.data) {
        setUniverse(res.data.universe);
        setNews(res.data.news);
        setLive(res.data.live);
        setLastUpdated(new Date().toISOString());
        console.log(
          `[market-intel] Loaded ${res.data.universe.length} ${bot} securities (live: ${res.data.live})`
        );
      } else {
        console.error("[market-intel] Failed to load /api/market, using local engine:", res.error);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [bot]
  );

  useEffect(() => {
    activeRef.current = true;
    setNews(getMarketNews(bot));
    load(false);
    return () => {
      activeRef.current = false;
    };
  }, [bot, load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return (
    <MarketIntelCtx.Provider
      value={{ universe, news, live, loading, refreshing, lastUpdated, bot, refresh }}
    >
      {children}
    </MarketIntelCtx.Provider>
  );
}
