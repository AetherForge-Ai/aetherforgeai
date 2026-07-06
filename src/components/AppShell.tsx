"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { BrandLogo } from "@/components/BrandLogo";
import { MarketTicker } from "@/components/MarketTicker";
import { planLabel } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LayoutDashboard, Bot, Settings, LogOut, Menu, Sparkles, Crown, Compass, Sparkle, FileSpreadsheet, Download, Loader2 } from "lucide-react";

export interface ShellUser {
  name: string;
  email: string;
  image?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
}

const NAV = [
  { href: "/dashboard", label: "Portfolio", icon: LayoutDashboard },
  { href: "/totalum", label: "Totalum", icon: Compass, pro: true },
  { href: "/chat", label: "AI Assistant", icon: Bot },
  { href: "/how-to-maximize-results", label: "Maximize Results", icon: Sparkle },
  { href: "/settings", label: "Settings", icon: Settings },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
            {"pro" in item && item.pro && (
              <span className="ml-auto rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Pro
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function PlanCard({ user }: { user: ShellUser }) {
  const isActive = user.subscription_status === "active";
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-center gap-2">
        {isActive ? (
          <Crown className="size-4 text-[var(--gold)]" />
        ) : (
          <Sparkles className="size-4 text-primary" />
        )}
        <span className="text-sm font-semibold">{isActive ? "AetherForge Pro" : "Free account"}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {isActive
          ? `${planLabel(user.subscription_plan)} · active`
          : "Upgrade to unlock the full experience."}
      </p>
      {!isActive && (
        <Button asChild size="sm" className="mt-3 h-8 w-full text-xs font-semibold">
          <Link href="/pricing">Upgrade to Pro</Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Investor Toolkit — annual-member perk, now living in the sidebar.
 * A compact card that downloads the pre-filled Excel toolkit. Only rendered for
 * yearly / dual_yearly subscribers; the endpoint enforces the same entitlement.
 */
function SidebarToolkit({ user }: { user: ShellUser }) {
  const isYearly = user.subscription_plan === "yearly" || user.subscription_plan === "dual_yearly";
  const [downloading, setDownloading] = useState(false);
  if (!isYearly) return null;

  async function handleDownload() {
    setDownloading(true);
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
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--gold)]/30 bg-gradient-to-br from-[var(--gold)]/10 to-card/50 p-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="size-4 text-[var(--gold)]" />
        <span className="text-sm font-semibold">Investor Toolkit</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Your Excel Portfolio Tracker &amp; Transactions ledger, pre-filled with your holdings.
      </p>
      <Button
        onClick={handleDownload}
        disabled={downloading}
        size="sm"
        className="mt-3 h-8 w-full text-xs font-semibold"
      >
        {downloading ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Preparing…
          </>
        ) : (
          <>
            <Download className="mr-1.5 size-3.5" /> Download .xlsx
          </>
        )}
      </Button>
    </div>
  );
}

function UserFooter({ user }: { user: ShellUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
      <Avatar className="size-8">
        {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
        <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
          {initials(user.name || "U")}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-none">{user.name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <button
        onClick={() => signOut().then(() => (window.location.href = "/"))}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-grid">
      <div className="pointer-events-none fixed inset-0 bg-aurora" />
      <div className="relative flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar/70 p-4 backdrop-blur-xl lg:flex">
          <Link href="/dashboard" className="px-2 py-1">
            <BrandLogo />
          </Link>
          <div className="mt-6 flex-1">
            <NavLinks pathname={pathname} />
          </div>
          <div className="space-y-3">
            <SidebarToolkit user={user} />
            <PlanCard user={user} />
            <UserFooter user={user} />
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen w-full min-w-0 flex-col">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <Link href="/dashboard">
              <BrandLogo />
            </Link>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-border/60 bg-sidebar p-4">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="px-2 py-1">
                  <BrandLogo />
                </div>
                <div className="mt-6">
                  <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                </div>
                <div className="mt-6 space-y-3">
                  <SidebarToolkit user={user} />
                  <PlanCard user={user} />
                  <UserFooter user={user} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Live market ticker banner across the top of the dashboard */}
          <MarketTicker compact />

          <div className="w-full flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
