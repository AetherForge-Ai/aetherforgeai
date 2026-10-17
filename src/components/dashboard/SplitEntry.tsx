"use client";

import { useState } from "react";
import { holdingAfterSplit } from "@/lib/stock-split";

/** Goal b9 H-9: split entry screen. Records an N:1 split on a holding. */
export default function SplitEntry() {
  const [ticker, setTicker] = useState("");
  const [ratio, setRatio] = useState("2");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/transactions/split", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, ratio: Number(ratio), date }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; holding?: { shares: number } };
      if (!res.ok || !json.ok) setMessage(json.error || "The split was not saved.");
      else setMessage(`Split recorded. ${ticker.toUpperCase()} now shows ${json.holding?.shares ?? "—"} shares.`);
    } finally {
      setBusy(false);
    }
  }

  const example = holdingAfterSplit(100, 10, Number(ratio) > 0 ? Number(ratio) : 1);
  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 p-6" aria-labelledby="split-heading">
      <h1 id="split-heading" className="text-xl font-semibold">Record a share split</h1>
      <p className="text-sm text-muted-foreground">
        Shares are multiplied by the ratio and the average cost is divided by it, so your NZ$ cost does not change.
        Earlier lots are restated for the tax pack. Example: 100 shares at NZ$10.00 become {example.shares} at NZ$
        {example.averageCost.toFixed(2)}.
      </p>
      <label className="block text-sm font-medium">
        Holding ticker
        <input required value={ticker} onChange={(e) => setTicker(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" placeholder="e.g. AIR.NZ" />
      </label>
      <label className="block text-sm font-medium">
        New shares for each old share (N:1)
        <input required type="number" min="0.0001" step="any" value={ratio} onChange={(e) => setRatio(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
      </label>
      <label className="block text-sm font-medium">
        Split date
        <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
      </label>
      <button type="submit" disabled={busy} className="h-9 rounded-md bg-[#047857] px-4 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Saving…" : "Record split"}
      </button>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      <p className="text-sm"><a href="/dashboard?view=shares" className="text-primary hover:underline">Back to holdings</a></p>
    </form>
  );
}
