"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import type { ExtendedUser } from "@/lib/auth";
import { planLabel } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Home,
  LayoutDashboard,
  LineChart,
  TrendingUp,
  Bot,
  Tag,
  Settings,
  Compass,
  LogOut,
  Menu,
  Crown,
  Sparkles,
  FileSpreadsheet,
  ChevronDown,
  PenTool,
} from "lucide-react";

/**
 * The ONE canonical primary navigation, rendered identically on every page —
 * marketing and authenticated alike. There is no separate sidebar anywhere;
 * portfolio/markets/projections all keep this same top bar. Section-level
 * sub-navigation lives inside each page (secondary tabs), never up here.
 */
const NAV_LINKS: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/markets", label: "Stock Markets", icon: LineChart, highlight: true },
  { href: "/projections", label: "Projections", icon: TrendingUp },
  { href: "/chat", label: "AI Assistant", icon: Bot },
  { href: "/pricing", label: "Pricing", icon: Tag },
  { href: "/website-design", label: "Website Design", icon: PenTool },
];

function initials(name: string) {
  return (name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Download the pre-filled Excel investor toolkit (yearly members only). */
async function downloadToolkit(setBusy: (b: boolean) => void) {
  setBusy(true);
  console.log("[toolkit] Requesting Excel toolkit download…");
  try {
    const res = await fetch("/api/downloads/toolkit", { method: "GET" });
    if (!res.ok) {
      let message = "Could not generate your toolkit.";
      try {
        const body = (await res.json()) as { ok: boolean; error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* non-JSON error body — keep default message */
      }
      console.error("[toolkit] Download failed:", res.status, message);
      toast.error(message);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Ultra-Advanced-Portfolio-Tracker-Stocks-Crypto-NZD.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log("[toolkit] Download started");
    toast.success("Your Excel toolkit is downloading");
  } catch (err) {
    console.error("[toolkit] Unexpected download error:", err);
    toast.error("Something went wrong preparing your toolkit.");
  } finally {
    setBusy(false);
  }
}

function DesktopLinks({ pathname }: { pathname: string }) {
  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {NAV_LINKS.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5">
              {item.label}
              {item.highlight && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-600">
                  Live
                </span>
              )}
            </span>
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountMenu({ user }: { user: ExtendedUser }) {
  const isActive = user.subscription_status === "active";
  // Runtime plan may be "dual_yearly" (broader than the narrowed type), so compare as string.
  const plan = String(user.subscription_plan || "");
  const isYearly = plan === "yearly" || plan === "dual_yearly";
  const [busy, setBusy] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 py-1 pl-1 pr-2 transition-colors hover:border-primary/50">
          <Avatar className="size-8">
            {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5 text-xs">
            {isActive ? (
              <Crown className="size-3.5 text-[var(--gold)]" />
            ) : (
              <Sparkles className="size-3.5 text-primary" />
            )}
            <span className="font-medium">
              {isActive ? `${planLabel(user.subscription_plan)} · active` : "Free account"}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard"><LayoutDashboard className="size-4" /> Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/totalum"><Compass className="size-4" /> Totalum <span className="ml-auto rounded bg-primary/15 px-1.5 py-px text-[9px] font-bold uppercase text-primary">Pro</span></Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings className="size-4" /> Account &amp; Settings</Link>
        </DropdownMenuItem>
        {isYearly && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              if (!busy) downloadToolkit(setBusy);
            }}
          >
            <FileSpreadsheet className="size-4" /> {busy ? "Preparing…" : "Investor Toolkit"}
          </DropdownMenuItem>
        )}
        {!isActive && (
          <DropdownMenuItem asChild>
            <Link href="/pricing" className="text-primary"><Sparkles className="size-4" /> Upgrade to Pro</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/logout" className="text-destructive focus:text-destructive"><LogOut className="size-4" /> Sign out</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileDrawer({ pathname, loggedIn }: { pathname: string; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-border/60 bg-sidebar p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="px-1 py-1">
          <BrandLogo />
        </div>
        <nav className="mt-6 space-y-1">
          {NAV_LINKS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {item.highlight && (
                  <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                    Live
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 space-y-2 border-t border-border/60 pt-4">
          {loggedIn ? (
            <>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/settings" onClick={() => setOpen(false)}>
                  <Settings className="size-4" /> Account &amp; Settings
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start text-destructive">
                <Link href="/logout"><LogOut className="size-4" /> Sign out</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild className="w-full font-semibold shadow-glow">
                <Link href="/register" onClick={() => setOpen(false)}>Get started free</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login" onClick={() => setOpen(false)}>Log in</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The single, consistent global top navigation bar. Rendered on EVERY page
 * (marketing + app) via SiteHeader and AppShell, so the primary menu never
 * changes shape or relocates to a sidebar when entering the portfolio.
 */
export function TopNav() {
  const { data: session, isPending } = useSession();
  const user = session?.user as ExtendedUser | undefined;
  const loggedIn = !!user;
  const pathname = usePathname();

  return (
    <header className="chrome-dark sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 text-foreground backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: mobile menu + brand */}
        <div className="flex items-center gap-2">
          <MobileDrawer pathname={pathname} loggedIn={loggedIn} />
          <Link href={loggedIn ? "/dashboard" : "/"} className="transition-opacity hover:opacity-90">
            <BrandLogo />
          </Link>
        </div>

        {/* Center: primary links */}
        <DesktopLinks pathname={pathname} />

        {/* Right: auth cluster */}
        <div className="flex items-center gap-2">
          {isPending ? (
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted/60" />
          ) : loggedIn && user ? (
            <AccountMenu user={user} />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm" className="font-semibold shadow-glow">
                <Link href="/register">Get started free</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
