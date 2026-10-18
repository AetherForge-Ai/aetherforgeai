"use client";

import { useState } from "react";

/** H-12: force one ticker stale, then reset it. This browser only. */
export function StaleTickerHookPanel() {
  const [ticker, setTicker] = useState("FPH.NZ");
  const [message, setMessage] = useState("No change yet.");

  async function send(reset: boolean) {
    setMessage("Working…");
    try {
      const res = await fetch("/api/test-hooks/stale-ticker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, reset }),
      });
      if (res.status === 404) {
        setMessage("This hook is not available.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { stale?: string[]; error?: string };
      if (!res.ok) {
        setMessage(body.error || `Status ${res.status}.`);
        return;
      }
      const list = (body.stale || []).join(", ") || "none";
      setMessage(reset ? `Reset. Stale list: ${list}.` : `That ticker is now stale. Stale list: ${list}.`);
    } catch {
      setMessage("The hook did not answer.");
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send(false);
      }}
    >
      <label className="block text-sm font-medium" htmlFor="stale-ticker">
        Ticker
      </label>
      <input
        id="stale-ticker"
        value={ticker}
        onChange={(event) => setTicker(event.target.value)}
        className="h-9 w-full rounded-md border px-3 text-sm"
        autoComplete="off"
      />
      <div className="flex gap-2">
        <button type="submit" className="h-9 rounded-md border px-4 text-sm font-semibold">
          Force stale
        </button>
        <button type="button" className="h-9 rounded-md border px-4 text-sm font-semibold" onClick={() => void send(true)}>
          Reset ticker
        </button>
        <button
          type="button"
          className="h-9 rounded-md border px-4 text-sm font-semibold"
          onClick={() => {
            setTicker("");
            void fetch("/api/test-hooks/stale-ticker", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reset: true }),
            })
              .then(async (res) => {
                if (res.status === 404) {
                  setMessage("This hook is not available.");
                  return;
                }
                setMessage("Reset. Stale list: none.");
              })
              .catch(() => setMessage("The hook did not answer."));
          }}
        >
          Reset all
        </button>
      </div>
      <p className="text-sm" data-stale-hook-status role="status">
        {message}
      </p>
    </form>
  );
}
