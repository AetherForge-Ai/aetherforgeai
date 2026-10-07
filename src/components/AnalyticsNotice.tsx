"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ANALYTICS_NOTICE } from "@/lib/public-copy";

const STORAGE_KEY = "af-analytics-notice";

/**
 * First-visit analytics notice. It is in the first HTML response.
 * A later visit hides it after the browser has stored a dismissal.
 */
export function AnalyticsNotice() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "dismissed") setHidden(true);
    } catch {
      /* Private mode can block storage. Leave the notice visible. */
    }
  }, []);

  if (hidden) return null;

  return (
    <div
      role="region"
      aria-label="Analytics notice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          {ANALYTICS_NOTICE}{" "}
          <Link href="/privacy-policy" className="font-semibold text-primary underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
        </p>
        <button
          type="button"
          className="rounded-md border border-border/70 px-3 py-1.5 text-sm font-semibold hover:bg-muted"
          onClick={() => {
            try {
              window.localStorage.setItem(STORAGE_KEY, "dismissed");
            } catch {
              /* Still hide it for this view. */
            }
            setHidden(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
