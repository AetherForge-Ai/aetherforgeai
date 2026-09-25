"use client";

/**
 * One shared crypto spot poll for the holdings page and crypto alerts.
 * Symbols are batched into a single /api/crypto/spot request. The poll pauses
 * while the tab is hidden or the Buy/Add dialog is open, and resumes on focus.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  CRYPTO_LIVE_POLL_MS,
  applyCryptoPollSuccess,
  normalizeCryptoSymbols,
  shouldFetchCryptoPoll,
  type CryptoPollState,
  type CryptoSpot,
} from "@/lib/crypto-live";
import { isTransactionDialogOpen } from "@/lib/transaction-sticky";

interface Store extends CryptoPollState {
  inflight: Promise<void> | null;
  inflightKey: string;
  timer: ReturnType<typeof setInterval> | null;
  listeners: Set<() => void>;
}

const store: Store = {
  quotes: {},
  updatedAt: null,
  inflight: null,
  inflightKey: "",
  timer: null,
  listeners: new Set(),
};

let subSeq = 0;
const subs = new Map<number, { symbols: string[]; enabled: boolean }>();

function notify() {
  store.listeners.forEach((fn) => fn());
}

function activeSymbols(): string[] {
  const all: string[] = [];
  for (const sub of subs.values()) {
    if (!sub.enabled) continue;
    all.push(...sub.symbols);
  }
  return normalizeCryptoSymbols(all);
}

async function pull(): Promise<void> {
  try {
    const symbols = activeSymbols();
    const hidden = typeof document !== "undefined" && document.hidden;
    if (!shouldFetchCryptoPoll({ hidden, dialogOpen: isTransactionDialogOpen(), hasSymbols: symbols.length > 0 })) {
      return;
    }
    const key = symbols.join(",");
    if (store.inflight && store.inflightKey === key) return store.inflight;

    const job = (async () => {
      try {
        const res = await api.get<{
          quotes: Record<string, CryptoSpot>;
          updatedAt: string;
          live: true;
        }>(`/api/crypto/spot?symbols=${encodeURIComponent(key)}`);
        if (isTransactionDialogOpen()) return;
        if (res.ok && res.data?.quotes) {
          const next = applyCryptoPollSuccess(store, res.data.quotes, Date.now());
          store.quotes = next.quotes;
          store.updatedAt = next.updatedAt;
          notify();
        } else if (!res.aborted && res.status !== 401) {
          console.error("[crypto-live] spot poll failed:", res.error);
        }
      } catch {
        /* 401 and network failures degrade to the last good quote */
      }
    })();

    store.inflightKey = key;
    store.inflight = job;
    try {
      await job;
    } finally {
      if (store.inflight === job) store.inflight = null;
    }
  } catch {
    /* callers use `void pull()` — never leave an unhandled rejection */
  }
}

function ensureTimer() {
  if (!activeSymbols().length) {
    if (store.timer) {
      clearInterval(store.timer);
      store.timer = null;
    }
    return;
  }
  if (store.timer) return;
  store.timer = setInterval(() => {
    void pull().catch(() => {});
  }, CRYPTO_LIVE_POLL_MS);
}

function onVisibility() {
  if (typeof document !== "undefined" && !document.hidden) void pull().catch(() => {});
}

let visibilityBound = false;
function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", onVisibility);
}

/** Resume after Buy/Add closes. No-op while the dialog or tab is still hidden. */
export function resumeCryptoLivePoll() {
  void pull().catch(() => {});
}

export function useLiveCryptoQuotes(symbols: string[], enabled: boolean): {
  quotes: Record<string, CryptoSpot>;
  updatedAt: number | null;
} {
  const [, setTick] = useState(0);
  const symbolKey = normalizeCryptoSymbols(enabled ? symbols : []).join(",");

  useEffect(() => {
    const id = ++subSeq;
    subs.set(id, { symbols: symbolKey ? symbolKey.split(",") : [], enabled: enabled && symbolKey.length > 0 });
    const listener = () => setTick((n) => n + 1);
    store.listeners.add(listener);
    bindVisibility();
    ensureTimer();
    if (enabled && symbolKey) void pull().catch(() => {});
    return () => {
      subs.delete(id);
      store.listeners.delete(listener);
      ensureTimer();
    };
  }, [symbolKey, enabled]);

  return { quotes: store.quotes, updatedAt: store.updatedAt };
}
