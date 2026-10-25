"use client";

/**
 * Shared client cache for the GeckoTerminal DEX list (up to 400).
 * One in-flight request. The poll matches the 60 second server backoff.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clientFacingError } from "@/lib/api-json";
import type { DexTokenRow } from "@/lib/crypto-dex";

const TTL_MS = 60_000;

interface Store {
  rows: DexTokenRow[];
  fetchedAt: number;
  loading: boolean;
  error: string | null;
  notice: string | null;
  printedAt: string | null;
  inflight: Promise<void> | null;
}

const store: Store = { rows: [], fetchedAt: 0, loading: false, error: null, notice: null, printedAt: null, inflight: null };
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

async function load(force = false): Promise<void> {
  const fresh = store.fetchedAt > 0 && Date.now() - store.fetchedAt < TTL_MS;
  if (!force && fresh) return;
  if (store.inflight) return store.inflight;

  store.loading = true;
  store.error = null;
  notify();

  store.inflight = (async () => {
    try {
      const res = await api.get<DexTokenRow[]>("/api/crypto/dex", {
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok && Array.isArray(res.data)) {
        store.rows = res.data.filter((row) => row.price != null && row.price > 0 && !row.priceUnavailable);
        store.fetchedAt = Date.now();
        store.error = null;
        store.notice = typeof res.notice === "string" ? res.notice : null;
        store.printedAt = typeof res.printedAt === "string" ? res.printedAt : null;
      } else if (store.rows.length > 0) {
        store.error = null;
      } else {
        store.error = clientFacingError("/api/crypto/dex", res.error);
      }
    } catch {
      store.error = store.rows.length
        ? null
        : clientFacingError("/api/crypto/dex", "Live decentralized-token prices are unavailable right now.");
    } finally {
      store.loading = false;
      store.inflight = null;
      notify();
    }
  })();

  return store.inflight;
}

export interface UseDexMarkets {
  rows: DexTokenRow[];
  loading: boolean;
  error: string | null;
  notice: string | null;
  /** b67 H-1: when the DEX list was printed (ISO). */
  printedAt: string | null;
  refresh: () => void;
}

/** True while the DEX list has no rows and either a request is in flight or none has answered yet. */
export function dexListLoading(input: { active: boolean; loading: boolean; fetchedAt: number; error: string | null; rows: number }): boolean {
  if (input.rows > 0) return false;
  if (input.loading) return true;
  return input.active && input.fetchedAt === 0 && !input.error;
}

export function useDexMarkets(active = true): UseDexMarkets {
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
    void load(false).catch(() => {});
    const iv = setInterval(() => void load(false).catch(() => {}), TTL_MS);
    return () => clearInterval(iv);
  }, [active]);

  const refresh = useCallback(() => void load(true).catch(() => {}), []);

  return {
    rows: store.rows,
    // Before the first answer the list is loading, not empty: show the skeleton, not the empty notice.
    loading: dexListLoading({ active, loading: store.loading, fetchedAt: store.fetchedAt, error: store.error, rows: store.rows.length }),
    error: store.error,
    notice: store.notice,
    printedAt: store.printedAt,
    refresh,
  };
}
