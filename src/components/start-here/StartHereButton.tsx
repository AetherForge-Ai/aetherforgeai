"use client";

/**
 * b89 START-1: a big "New here? Start here" button on the signed-in dashboard.
 * Dismiss is saved per user in localStorage. After dismissal a small link stays in its place,
 * and "Start here" is always in the top menu and on /help.
 */
import * as React from "react";
import Link from "next/link";
import { Footprints, X } from "lucide-react";

export const startHereDismissKey = (userId: string | null | undefined) => `af:start-here-dismissed:${userId || "anon"}`;

export function StartHereButton({ userId }: { userId?: string | null }) {
  const key = startHereDismissKey(userId);
  const [dismissed, setDismissed] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key]);
  if (dismissed === null) return <div className="mt-4 min-h-11" aria-hidden="true" />;
  if (dismissed) {
    return (
      <p className="mt-4 text-sm">
        <Link href="/start-here" data-start-here-link className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary hover:underline md:min-h-0">
          <Footprints className="size-4" aria-hidden="true" /> New here? Start here
        </Link>
      </p>
    );
  }
  return (
    <div data-start-here-button className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-3 sm:p-4">
      <Link
        href="/start-here"
        className="flex min-h-12 flex-1 items-center gap-3 rounded-xl bg-primary px-4 py-3 text-base font-bold text-primary-foreground shadow-glow hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Footprints className="size-6 shrink-0" aria-hidden="true" />
        <span>
          New here? Start here
          <span className="block text-sm font-medium opacity-90">A simple guide to everything on this page</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(key, "1");
          } catch {
            /* storage blocked: hide for this visit only */
          }
          setDismissed(true);
        }}
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Hide the Start here button. You can find it again under More, Start here."
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
