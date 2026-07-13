"use client";

/**
 * Shared client cache for the top-500 crypto universe.
 *
 * A single module-level store backs BOTH the Crypto Market modal and the
 * Projected Performers section, so they never double-fetch. In-flight requests
 * are deduped, results are cached ~60s (stale-while-revalidate), and every
 * mounted consumer is notified on update via a lightweight subscription.
 */

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { CoinMarket } from "@/lib/crypto-market";

const TTL_MS = 60_000;

interface Store {
  coins: CoinMarket[];
  fetchedAt: number; // epoch ms of last successful load (0 = never)
  loading: boolean;
  error: string | null;
  inflight: Promise<void> | null;
}

const store: Store = { coins: [], fetchedAt: 0, loading: false, error: null, inflight: null };
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

async function load(force = false): Promise<void> {
  const fresh = store.fetchedAt > 0 && Date.now() - store.fetchedAt < TTL_MS;
  if (!force && fresh) return;
  if (store.inflight) return store.inflight; // dedupe concurrent callers

  store.loading = true;
  store.error = null;
  notify();

  store.inflight = (async () => {
    const res = await api.get<CoinMarket[]>("/api/crypto/markets");
    if (res.ok && Array.isArray(res.data)) {
      store.coins = res.data;
      store.fetchedAt = Date.now();
      store.error = null;
      console.log(`[useCryptoMarkets] loaded ${res.data.length} coins`);
    } else {
      store.error = typeof res.error === "string" ? res.error : "Failed to load crypto markets";
      console.error("[useCryptoMarkets] load failed:", res.error);
    }
    store.loading = false;
    store.inflight = null;
    notify();
  })();

  return store.inflight;
}

export interface UseCryptoMarkets {
  coins: CoinMarket[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

/**
 * @param active  When false the hook won't auto-fetch (e.g. modal closed) —
 *                but still exposes any already-cached data instantly.
 */
export function useCryptoMarkets(active = true): UseCryptoMarkets {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const sub = () => forceRender((n) => n + 1);
    subscribers.add(sub);
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    void load(false);
    const iv = setInterval(() => void load(false), TTL_MS);
    return () => clearInterval(iv);
  }, [active]);

  const refresh = useCallback(() => void load(true), []);

  return {
    coins: store.coins,
    loading: store.loading && store.coins.length === 0,
    refreshing: store.loading && store.coins.length > 0,
    error: store.error,
    lastUpdated: store.fetchedAt ? new Date(store.fetchedAt) : null,
    refresh,
  };
}
