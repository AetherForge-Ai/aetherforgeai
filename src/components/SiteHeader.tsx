"use client";

import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";

export function SiteHeader() {
  const { data: session, isPending } = useSession();
  const loggedIn = !!session?.user;

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mt-3 flex h-14 items-center justify-between rounded-2xl border border-border/70 glass px-4 shadow-lg">
          <Link href="/" className="shrink-0">
            <BrandLogo animated />
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            <a href="/#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
            <Link href="/how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </Link>
            <Link href="/pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {isPending ? (
              <div className="h-9 w-24 animate-pulse rounded-lg bg-muted/60" />
            ) : loggedIn ? (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <span
                    onClick={() => signOut().then(() => (window.location.href = "/"))}
                    role="button"
                    tabIndex={0}
                  >
                    Sign out
                  </span>
                </Button>
                <Button asChild size="sm" className="font-semibold">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild size="sm" className="font-semibold shadow-glow">
                  <Link href="/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
