"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveSessionUser } from "@/lib/use-live-session";
import { useMemberDashboardPrompt } from "@/components/dashboard/MemberDashboardPrompt";
import { planIncludesToolkit, planLabel } from "@/lib/plans";
import { headmasterDeskCopy } from "@/lib/entitlements";
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
import { openRecordTransaction } from "@/lib/open-transaction";
import {
  Home,
  LayoutDashboard,
  LineChart,
  Tag,
  Newspaper,
  Trophy,
  Scale,
  MessageSquare,
  Settings,
  Compass,
  Loader2,
  LogOut,
  Menu,
  Crown,
  Sparkles,
  FileSpreadsheet,
  ChevronDown,
  Plus,
  BookOpen,
  Shield,
} from "lucide-react";

/**
 * The ONE canonical primary navigation, rendered identically on every page —
 * marketing and authenticated alike. There is no separate sidebar anywhere;
 * portfolio/markets/projections all keep this same top bar. Section-level
 * sub-navigation lives inside each page (secondary tabs), never up here.
 */
type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const MARKET_LINKS: NavLink[] = [
  { href: "/markets", label: "Markets", icon: LineChart },
  { href: "/market-news", label: "Market News", icon: Newspaper },
];

const MORE_LINKS: NavLink[] = [
  { href: "/performance", label: "Example results", icon: Trophy },
  { href: "/track-record", label: "Track record", icon: Trophy },
  { href: "/tax", label: "Tax", icon: Scale },
  { href: "/pricing", label: "Pricing", icon: Tag },
  { href: "/how-it-works", label: "How it works", icon: BookOpen },
  { href: "/projections", label: "Projections", icon: Sparkles },
  { href: "/trust", label: "Trust", icon: Shield },
];

const NAV_LINKS: NavLink[] = [...PRIMARY_LINKS, ...MARKET_LINKS, ...MORE_LINKS];

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

/** Download the Excel investor toolkit template (yearly plans). */
async function downloadToolkit(setBusy: (b: boolean) => void) {
  setBusy(true);
  console.log("[toolkit] Requesting Excel toolkit download…");
  try {
    const res = await fetch("/api/downloads/toolkit", { method: "GET" });
    if (!res.ok) {
      let message = "Could not download the toolkit template.";
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
    a.download = "AetherForge-Portfolio-Tracker-Stocks-Crypto-NZD.xlsx";
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

function NavAnchor({
  item,
  pathname,
  onDashboardClick,
}: {
  item: NavLink;
  pathname: string;
  onDashboardClick: (event: React.MouseEvent) => void;
}) {
  const active = isActivePath(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={item.href === "/dashboard" ? onDashboardClick : undefined}
      className={cn(
        "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-1.5">{item.label}</span>
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
    </Link>
  );
}

function NavMenu({
  label,
  links,
  pathname,
  onDashboardClick,
}: {
  label: string;
  links: NavLink[];
  pathname: string;
  onDashboardClick: (event: React.MouseEvent) => void;
}) {
  const active = links.some((item) => isActivePath(pathname, item.href));
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          "relative inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown className="size-3.5" />
        {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[100] w-52">
        {links.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} onClick={item.href === "/dashboard" ? onDashboardClick : undefined}>
              <item.icon className="size-4" /> {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function visiblePrimaryLinks(loggedIn: boolean): NavLink[] {
  if (loggedIn) return PRIMARY_LINKS;
  return PRIMARY_LINKS.filter((item) => item.href !== "/dashboard");
}

function DesktopLinks({
  pathname,
  loggedIn,
  onDashboardClick,
}: {
  pathname: string;
  loggedIn: boolean;
  onDashboardClick: (event: React.MouseEvent) => void;
}) {
  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {visiblePrimaryLinks(loggedIn).map((item) => (
        <NavAnchor key={item.href} item={item} pathname={pathname} onDashboardClick={onDashboardClick} />
      ))}
      <NavMenu label="Markets" links={MARKET_LINKS} pathname={pathname} onDashboardClick={onDashboardClick} />
      <NavMenu label="More" links={MORE_LINKS} pathname={pathname} onDashboardClick={onDashboardClick} />
    </nav>
  );
}

function HeadmasterMenuLink({ plan }: { plan?: string | null }) {
  const [pending, setPending] = useState(false);
  return (
    <Link href="/headmaster" aria-busy={pending} onClick={() => setPending(true)}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Compass className="size-4" />}
      {pending ? "Opening The Headmaster…" : "The Headmaster"}
      <span className="ml-auto rounded bg-primary/15 px-1.5 py-px text-[9px] font-bold uppercase text-primary">
        {headmasterDeskCopy(plan).badge}
      </span>
    </Link>
  );
}

function AccountMenu({
  user,
}: {
  user: {
    name: string;
    email: string;
    image?: string | null;
    subscription_status?: string | null;
    subscription_plan?: string | null;
  };
}) {
  const isActive = user.subscription_status === "active";
  // Runtime plan may be "dual_yearly" (broader than the narrowed type), so compare as string.
  const plan = String(user.subscription_plan || "");
  const isYearly = planIncludesToolkit(plan);
  const [busy, setBusy] = useState(false);
  // Controlled + non-modal so opening mid-page does not scroll-lock / jump the sticky
  // header and instantly dismiss the menu. Stays open until the avatar is clicked again
  // (minimize), Escape, or a menu action is chosen.
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 py-1 pl-1 pr-2 transition-colors hover:border-primary/50"
        >
          <Avatar className="size-8">
            {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-[100] w-64"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Keep open while scrolling or tapping the page; only the trigger / Escape / item closes it.
          e.preventDefault();
        }}
      >
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
          <Link href="/chat"><MessageSquare className="size-4" /> Market Assistant</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <HeadmasterMenuLink plan={user.subscription_plan} />
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
            <Link href="/pricing#pro" className="text-primary"><Sparkles className="size-4" /> Upgrade to Pro</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/logout" className="text-destructive focus:text-destructive"><LogOut className="size-4" /> Sign out</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileDrawer({
  pathname,
  loggedIn,
  pending,
  onDashboardClick,
}: {
  pathname: string;
  loggedIn: boolean;
  pending: boolean;
  onDashboardClick: (event: React.MouseEvent) => void;
}) {
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
          {visiblePrimaryLinks(loggedIn).map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => {
                  setOpen(false);
                  if (item.href === "/dashboard") onDashboardClick(event);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
          <p className="px-3 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Markets</p>
          {MARKET_LINKS.map((item) => {
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
              </Link>
            );
          })}
          <p className="px-3 pt-3 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">More</p>
          {MORE_LINKS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => {
                  setOpen(false);
                  if (item.href === "/dashboard") onDashboardClick(event);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 space-y-2 border-t border-border/60 pt-4">
          {pending ? (
            <div className="h-10 animate-pulse rounded-xl bg-muted/60" />
          ) : loggedIn ? (
            <>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/settings" onClick={() => setOpen(false)}>
                  <Settings className="size-4" /> Account &amp; Settings
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start text-destructive">
                <a href="/logout"><LogOut className="size-4" /> Sign out</a>
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
  const { user } = useLiveSessionUser();
  const memberDashboard = useMemberDashboardPrompt();
  const pending = user === undefined;
  const loggedIn = !!user;
  const pathname = usePathname();

  return (
    <>
    <header className="chrome-dark sticky top-0 z-[60] w-full border-b border-border/60 bg-background/85 text-foreground backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: mobile menu + brand */}
        <div className="flex items-center gap-2">
          <MobileDrawer
            pathname={pathname}
            loggedIn={loggedIn}
            pending={pending}
            onDashboardClick={memberDashboard.onDashboardClick}
          />
          <Link href={loggedIn ? "/dashboard" : "/"} className="transition-opacity hover:opacity-90">
            <BrandLogo />
          </Link>
        </div>

        {/* Center: primary links */}
        <DesktopLinks pathname={pathname} loggedIn={loggedIn} onDashboardClick={memberDashboard.onDashboardClick} />

        {/* Right: auth cluster */}
        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Button
              size="sm"
              className="font-semibold shadow-glow"
              onClick={() => openRecordTransaction({ mode: "buy" })}
            >
              <Plus className="mr-1.5 size-4" /> Add
            </Button>
          ) : null}
          {pending ? (
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
    {memberDashboard.dialog}
    </>
  );
}
