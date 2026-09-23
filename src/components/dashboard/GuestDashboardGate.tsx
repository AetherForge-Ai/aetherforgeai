import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown instead of the portfolio when a logged-out visitor opens Dashboard.
 * Login and register are explicit — guests are not dropped on an empty preview.
 */
export function GuestDashboardGate() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/80 px-6 py-10 text-center shadow-sm sm:px-8">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
          <Lock className="size-6" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Sign in to open your Dashboard
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          The Dashboard is for account holders. Log in or create a free account to track your
          portfolio, markets, and reports.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="h-11 px-6 font-semibold shadow-glow">
            <Link href="/login?redirect=/dashboard">Log in</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 px-6 font-semibold">
            <Link href="/register">Create free account</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
