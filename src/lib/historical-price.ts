/** Pick the session close on a calendar day, or the last close before it. */

export interface CloseBar {
  /** yyyy-mm-dd */
  date: string;
  close: number;
}

export function closeOnOrBefore(bars: CloseBar[], day: string): number | null {
  const want = (day || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(want)) return null;
  let best: CloseBar | null = null;
  for (const bar of bars) {
    if (!(bar.close > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(bar.date)) continue;
    if (bar.date > want) continue;
    if (!best || bar.date > best.date) best = bar;
  }
  return best ? best.close : null;
}

/** Yahoo chart timestamps (unix seconds) and closes → calendar bars in UTC. */
export function barsFromYahoo(timestamps: number[], closes: Array<number | null>): CloseBar[] {
  const out: CloseBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const close = closes[i];
    if (!(t > 0) || !(close != null && close > 0)) continue;
    const date = new Date(t * 1000).toISOString().slice(0, 10);
    out.push({ date, close });
  }
  return out;
}
