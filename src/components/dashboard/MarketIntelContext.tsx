"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { getMarketNews, type AssetClass, type NewsItem, type SecurityIntel } from "@/lib/market-intel";
import { isTransactionDialogOpen } from "@/lib/transaction-sticky";
import { getTxDialogSnapshot, subscribeTxDialog } from "@/lib/transaction-dialog-store";

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
  const pendingRef = useRef<{ universe: SecurityIntel[]; news: NewsItem[]; live: boolean } | null>(null);

  const applyPayload = useCallback((data: { universe: SecurityIntel[]; news: NewsItem[]; live: boolean }) => {
    setUniverse(data.universe);
    setNews(data.news);
    setLive(data.live);
    setLastUpdated(new Date().toISOString());
    setLoading(false);
    setRefreshing(false);
  }, []);

  const load = useCallback(
    async (isManual: boolean) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      const res = await api.get<{ live: boolean; universe: SecurityIntel[]; news: NewsItem[] }>(
        `/api/market?bot=${bot}&t=${Date.now()}`
      );
      if (!activeRef.current) return;
      if (res.ok && res.data) {
        // Stocks hub widgets (actionable signals, movers) subscribe to this
        // context. Applying the payload while Buy/Add is searching remounts
        // those dialogs and dismisses the ticker popover. Transactions keeps
        // the same provider but its market sections are not the visible stack.
        if (isTransactionDialogOpen()) {
          pendingRef.current = {
            universe: res.data.universe,
            news: res.data.news,
            live: res.data.live,
          };
          console.log("[market-intel] Universe deferred — Transaction dialog open");
          return;
        }
        pendingRef.current = null;
        console.log(
          `[market-intel] Loaded ${res.data.universe.length} ${bot} securities (live: ${res.data.live})`
        );
        applyPayload(res.data);
        return;
      }
      console.error("[market-intel] Failed to load /api/market, using local engine:", res.error);
      setLoading(false);
      setRefreshing(false);
    },
    [bot, applyPayload]
  );

  useEffect(() => {
    return subscribeTxDialog(() => {
      if (getTxDialogSnapshot().open) return;
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      console.log(`[market-intel] Applying deferred universe (${pending.universe.length})`);
      applyPayload(pending);
    });
  }, [applyPayload]);

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
