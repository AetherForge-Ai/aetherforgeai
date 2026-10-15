"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

/**
 * H-4: one error panel for route error boundaries. Plain words, a Try again
 * button that re-renders the segment, and a reference code for support.
 * Technical details stay in the console.
 */
export function RouteErrorPanel({
  error,
  reset,
  title = "This part of the page did not load",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error("[error-boundary]", error);
    heading.current?.focus();
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[320px] w-full items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your book is safe. Try again, or come back in a minute.
          {error.digest ? ` Reference: ${error.digest}.` : ""}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <Link href="/" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
