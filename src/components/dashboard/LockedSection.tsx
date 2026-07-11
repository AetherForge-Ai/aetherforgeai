"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Wraps a real dashboard section for logged-out visitors: the genuine UI is
 * rendered behind a soft scrim (greyed, blurred, non-interactive) so guests can
 * see exactly what they'd get, while a centred lock card invites them to sign up.
 * Only the CTA buttons remain clickable — the underlying section cannot be used.
 */
export function LockedSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative isolate", className)}>
      {/* The genuine section — visible, but greyed out and fully inert. */}
      <div
        aria-hidden
        className="pointer-events-none select-none opacity-55 blur-[1.5px] grayscale-[45%] saturate-50"
      >
        {children}
      </div>

      {/* "Members only" corner chip */}
      <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur sm:right-4 sm:top-4 sm:text-[11px]">
        <Lock className="size-3" /> Members only
      </span>

      {/* Centred unlock card (the only interactive layer) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-gradient-to-b from-background/45 via-background/65 to-background/85 p-4 backdrop-blur-[1px]">
        <div className="w-full max-w-sm rounded-2xl border border-primary/25 bg-card/90 p-5 text-center shadow-xl backdrop-blur sm:p-6">
          <span className="mx-auto grid size-11 place-items-center rounded-xl border border-primary/30 bg-primary/12 text-primary">
            <Lock className="size-5" />
          </span>
          <p className="mt-3 font-display text-base font-bold leading-tight sm:text-lg">{title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {description ?? "Create your free account to unlock this and start tracking live."}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild size="sm" className="font-semibold shadow-glow">
              <Link href="/register">Create free account</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="font-semibold">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
