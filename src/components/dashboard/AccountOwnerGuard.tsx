"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { alignTradeSession, confirmPageSession } from "@/lib/auth-refresh";
import { bindActiveAccount } from "@/lib/account-identity";
import { accountPaintDecision, type AccountPaint } from "@/lib/session-owner";
import { GuestDashboardGate } from "@/components/dashboard/GuestDashboardGate";
import { Button } from "@/components/ui/button";

const RECOVER_AT = "af.sessionRecoverAt";
const RECOVER_WINDOW_MS = 8000;

function recentlyRecovered(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RECOVER_AT) || 0);
    return Number.isFinite(at) && Date.now() - at < RECOVER_WINDOW_MS;
  } catch {
    return false;
  }
}

function hardReload(): void {
  try {
    sessionStorage.setItem(RECOVER_AT, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.location.replace(`${window.location.pathname}${window.location.search}`);
}

/** No name and no figures while the live session owner is still unknown. */
export function DashboardSessionSkeleton() {
  return (
    <div className="space-y-4 py-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted/70" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
      <p className="sr-only">Checking this browser session before loading the paper book.</p>
    </div>
  );
}

function SessionConflictNotice() {
  const pathname = usePathname();
  const next = pathname && pathname.startsWith("/") ? pathname : "/dashboard";
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/80 px-6 py-10 text-center shadow-sm sm:px-8">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
          <Lock className="size-6" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Sign in again to open this paper book
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          This browser session does not match the account on the page. Sign in again before
          trusting any figures.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild className="h-11 px-6 font-semibold shadow-glow">
            <Link href={`/login?redirect=${encodeURIComponent(next)}`}>Log in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Server rendered a signed-in dashboard that the live cookie does not own.
 * Holdings, metals, and transactions stay unmounted until the ids match.
 */
export function AccountOwnerGuard({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<AccountPaint>("pending");
  const [boundId, setBoundId] = useState(userId);
  if (boundId !== userId) {
    setBoundId(userId);
    setPhase("pending");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await confirmPageSession();
      if (cancelled) return;
      let decision = accountPaintDecision(userId, user?.id ?? null);
      // The document can arrive before the login cookie is readable. One
      // delayed strict read before painting the signed-out gate.
      if (decision === "signed-out") {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (cancelled) return;
        const again = await alignTradeSession(userId, false);
        if (cancelled) return;
        if (!again.ok) {
          setPhase("mismatch");
          return;
        }
        decision = accountPaintDecision(userId, again.userId);
      }
      if (decision === "paint") {
        bindActiveAccount(userId);
        setPhase("paint");
        return;
      }
      if (decision === "mismatch") {
        if (recentlyRecovered()) {
          setPhase("mismatch");
          return;
        }
        hardReload();
        return;
      }
      setPhase("signed-out");
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, userId]);

  if (phase === "paint") return <>{children}</>;
  if (phase === "signed-out") return <GuestDashboardGate />;
  if (phase === "mismatch") return <SessionConflictNotice />;
  return <DashboardSessionSkeleton />;
}

/**
 * Server rendered the login gate. Confirm the cookie is actually empty
 * before showing it — a stale session_data cookie can null the first read
 * while the session token is still valid.
 */
export function DashboardSessionRecovery({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"pending" | "guest" | "mismatch">("pending");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let user = await confirmPageSession();
      if (cancelled) return;
      if (!user?.id) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (cancelled) return;
        const again = await alignTradeSession(null, false);
        if (cancelled) return;
        if (again.ok && again.userId) {
          user = {
            id: again.userId,
            email: "",
            name: "",
          };
        }
      }
      if (user?.id) {
        if (recentlyRecovered()) {
          setPhase("mismatch");
          return;
        }
        hardReload();
        return;
      }
      setPhase("guest");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "guest") return <>{children}</>;
  if (phase === "mismatch") return <SessionConflictNotice />;
  return <DashboardSessionSkeleton />;
}
