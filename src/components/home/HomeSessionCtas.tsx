"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

function CtaSkeleton({ className }: { className?: string }) {
  return <div className={`h-12 animate-pulse rounded-md bg-muted/50 ${className ?? "w-36"}`} />;
}

/** Hero actions. Logged-in visitors do not see "Start free". */
export function HomeHeroCtas() {
  const { data: session, isPending } = useSession();
  const loggedIn = !!session?.user;

  if (isPending) {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <CtaSkeleton className="w-32" />
        <CtaSkeleton className="w-40" />
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {!loggedIn && (
        <Button asChild className="h-12 px-7 text-base shadow-glow">
          <Link href="/register">
            Start free
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}
      <Button
        asChild
        variant={loggedIn ? "default" : "outline"}
        className={
          loggedIn
            ? "h-12 px-7 text-base shadow-glow"
            : "h-12 px-7 text-base border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        }
      >
        <Link href="/dashboard">Open Dashboard</Link>
      </Button>
    </div>
  );
}

/** Bottom "Ready to take care of your Portfolio?" action. */
export function HomeBottomCta() {
  const { data: session, isPending } = useSession();
  const loggedIn = !!session?.user;

  if (isPending) {
    return <CtaSkeleton className="mx-auto mt-8 w-40" />;
  }

  if (loggedIn) {
    return (
      <Button asChild className="mt-8 h-12 px-8 text-base shadow-glow">
        <Link href="/dashboard">
          Go to your Dashboard
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild className="mt-8 h-12 px-8 text-base shadow-glow">
      <Link href="/register">
        Start free
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}
