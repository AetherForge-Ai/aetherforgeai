"use client";

import { useEffect, useState } from "react";
import {
  FEED_FORCE_COOKIE,
  FEED_FORCE_LABEL,
  NAMED_FEEDS,
  feedForceCookieValue,
  readFeedForce,
  type FeedForceState,
  type NamedFeed,
} from "@/lib/feed-freshness-hook";

/** G-05 controls. This browser only. Nothing is saved. */
export function FeedFreshnessHookPanel() {
  const [feed, setFeed] = useState<NamedFeed>("crypto");
  const [current, setCurrent] = useState("reset");

  useEffect(() => {
    const force = readFeedForce(document.cookie, true);
    setCurrent(force ? `${force.name}:${force.state}` : "reset");
  }, []);

  function write(state: FeedForceState | "reset") {
    if (state === "reset") {
      document.cookie = `${FEED_FORCE_COOKIE}=; path=/; max-age=0; samesite=lax`;
      setCurrent("reset");
      return;
    }
    const value = feedForceCookieValue({ name: feed, state });
    document.cookie = `${FEED_FORCE_COOKIE}=${value}; path=/; max-age=3600; samesite=lax`;
    setCurrent(value);
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Feed freshness hook</h1>
      <p className="text-sm text-muted-foreground">
        Marks one price feed stale or failed for this browser, then clears the mark. Open Status afterwards. Equity and crypto dots on the home tape follow the same mark.
      </p>
      <label className="block text-sm font-semibold" htmlFor="feed-name">
        Feed
      </label>
      <select
        id="feed-name"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={feed}
        onChange={(event) => setFeed(event.target.value as NamedFeed)}
      >
        {NAMED_FEEDS.map((name) => (
          <option key={name} value={name}>
            {FEED_FORCE_LABEL[name]}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="h-9 rounded-md border px-4 text-sm font-semibold" onClick={() => write("stale")}>
          Mark stale
        </button>
        <button type="button" className="h-9 rounded-md border px-4 text-sm font-semibold" onClick={() => write("failed")}>
          Mark failed
        </button>
        <button type="button" className="h-9 rounded-md border px-4 text-sm font-semibold" onClick={() => write("reset")}>
          Reset
        </button>
      </div>
      <p className="text-sm" data-feed-force={current}>
        Mark is <strong>{current}</strong>. Stale cells are amber. Failed cells are red. Reset follows the print age again.
      </p>
      <p className="text-sm">
        <a className="underline" href="/status">
          Status
        </a>
        {" · "}
        <a className="underline" href="/">
          Home tape
        </a>
      </p>
    </main>
  );
}
