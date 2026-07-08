"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { Menu, X, ArrowRight } from "lucide-react";

// Single source of truth for the primary navigation — used by both the
// boxed desktop bar and the prominent left-hand mobile drawer.
const NAV_LINKS: { label: string; href: string; external?: boolean; highlight?: boolean }[] = [
  { label: "Features", href: "/#features", external: true },
  { label: "About", href: "/about" },
  { label: "Live results", href: "/performance", highlight: true },
  { label: "How it works", href: "/how-it-works" },
  { label: "Maximize results", href: "/how-to-maximize-results" },
  { label: "Pricing", href: "/pricing" },
  { label: "Dashboard", href: "/dashboard" },
];

export function SiteHeader() {
  const { data: session, isPending } = useSession();
  const loggedIn = !!session?.user;
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const isActive = (href: string) =>
    !href.includes("#") && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mt-3 flex h-16 items-center justify-between gap-3 rounded-2xl border border-border/70 glass px-3 shadow-lg sm:px-4">
          {/* Left cluster: mobile menu trigger + brand */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-card/60 text-foreground transition-colors hover:border-primary/50 hover:text-primary md:hidden"
            >
              <Menu className="size-5" />
            </button>
            <Link href="/" className="shrink-0">
              <BrandLogo animated />
            </Link>
          </div>

          {/* Desktop nav — boxed, official, distinct from the flashing banners */}
          <nav className="hidden items-center gap-1 rounded-xl border border-border/60 bg-background/40 p-1 shadow-inner md:flex">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href) || (link.highlight && isActive(link.href));
              const base =
                "rounded-lg px-3 py-2 text-[13px] font-semibold tracking-tight transition-all lg:text-sm";
              const cls = link.highlight
                ? `${base} bg-primary/10 text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary/15 hover:shadow-glow`
                : active
                  ? `${base} bg-card text-foreground ring-1 ring-inset ring-border/70 shadow-sm`
                  : `${base} text-muted-foreground hover:bg-card/70 hover:text-foreground`;

              return link.external ? (
                <a key={link.href} href={link.href} className={cls}>
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} href={link.href} className={cls}>
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right cluster: auth actions */}
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
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
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

      {/* ───────── Mobile drawer — prominent, left-hand side ───────── */}
      {/* Backdrop */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col border-r border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out md:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <BrandLogo animated />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="grid size-10 place-items-center rounded-xl border border-border/70 bg-background/50 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5">
          <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Menu
          </p>
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            const base =
              "flex items-center justify-between rounded-xl border px-4 py-3.5 text-base font-semibold transition-all";
            const cls = link.highlight
              ? `${base} border-primary/30 bg-primary/10 text-primary shadow-glow`
              : active
                ? `${base} border-border/70 bg-background/70 text-foreground shadow-sm`
                : `${base} border-border/50 bg-background/30 text-foreground/90 hover:border-primary/40 hover:bg-background/60 hover:text-primary`;

            const content = (
              <>
                <span>{link.label}</span>
                <ArrowRight className="size-4 opacity-50" />
              </>
            );

            return link.external ? (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className={cls}>
                {content}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className={cls}>
                {content}
              </Link>
            );
          })}
        </nav>

        {/* Auth actions inside the drawer */}
        <div className="space-y-2 border-t border-border/60 px-4 py-5">
          {loggedIn ? (
            <>
              <Button asChild size="lg" className="w-full font-semibold">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => signOut().then(() => (window.location.href = "/"))}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="lg" className="w-full font-semibold shadow-glow">
                <Link href="/register">Get started free</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href="/login">Log in</Link>
              </Button>
            </>
          )}
        </div>
      </aside>
    </header>
  );
}
