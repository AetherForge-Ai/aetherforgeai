/**
 * Company-name lookup for a broker file.
 * Exact normalised names only. A name that matches two tickers is not guessed.
 */

import { stockBoards } from "@/lib/stock-catalog";

const SUFFIX = /\b(limited|ltd|inc|incorporated|plc|corp|corporation)\b/g;

function fold(value: string, stripSuffix: boolean): string {
  const base = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripSuffix) return base;
  return base.replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
}

let index: Map<string, string[]> | null = null;

function nameIndex(): Map<string, string[]> {
  if (index) return index;
  const map = new Map<string, string[]>();
  const add = (name: string, ticker: string) => {
    const key = fold(name, false);
    const stripped = fold(name, true);
    for (const form of stripped && stripped !== key ? [key, stripped] : [key]) {
      if (!form) continue;
      const list = map.get(form) || [];
      if (!list.includes(ticker)) list.push(ticker);
      map.set(form, list);
    }
  };
  for (const board of Object.values(stockBoards())) {
    for (const row of board) {
      if (!row.name || !row.ticker) continue;
      add(row.name, row.ticker.toUpperCase());
    }
  }
  index = map;
  return map;
}

/** Tickers whose listing name matches exactly. Empty when the name is not on the list. */
export function tickersForCompanyName(name: string): string[] {
  const full = fold(name, false);
  const stripped = fold(name, true);
  const hits = new Set<string>();
  for (const key of [stripped, full]) {
    if (!key) continue;
    for (const ticker of nameIndex().get(key) || []) hits.add(ticker);
  }
  return [...hits].sort();
}
