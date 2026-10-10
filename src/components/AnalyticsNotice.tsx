"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  OPEN_COOKIE_SETTINGS_EVENT,
  readAnalyticsChoice,
  writeAnalyticsChoice,
  type AnalyticsChoice,
} from "@/lib/analytics-consent";
import { ANALYTICS_NOTICE } from "@/lib/public-copy";

const choiceClass =
  "min-w-[7.5rem] rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted";

/**
 * Equal-weight Accept and Decline. The tag stays off until Accept.
 * Cookie settings in the footer opens this again.
 */
export function AnalyticsNotice() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const stored = readAnalyticsChoice();
    setHidden(stored === "granted" || stored === "denied");
    const open = () => setHidden(false);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
  }, []);

  function choose(choice: AnalyticsChoice) {
    try {
      writeAnalyticsChoice(choice);
    } catch {
      /* Private mode can block storage. Still hide it for this view. */
    }
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div
      role="region"
      aria-label="Analytics notice"
      className="fixed bottom-0 left-0 right-[5.5rem] z-40 border-t border-border/70 bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:right-[18rem] sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          {ANALYTICS_NOTICE}{" "}
          <Link href="/privacy-policy" className="font-semibold text-primary underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
        </p>
        <div className="flex gap-2">
          <button type="button" className={choiceClass} onClick={() => choose("granted")}>
            Accept
          </button>
          <button type="button" className={choiceClass} onClick={() => choose("denied")}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
