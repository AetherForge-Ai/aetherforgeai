"use client";

import { ReactNode } from "react";
import { TopNav } from "@/components/TopNav";
import { MarketTicker } from "@/components/MarketTicker";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";

export interface ShellUser {
  name: string;
  email: string;
  image?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
}

/**
 * Authenticated app frame. Renders the SINGLE global top navigation (identical
 * to every marketing page — no sidebar, ever), the live market ticker and the
 * persistent NZ disclaimer. `user` / `guest` are accepted for backwards
 * compatibility with existing pages, but the nav derives auth state from the
 * live session so the bar is always consistent.
 */
export function AppShell({
  children,
}: {
  user?: ShellUser;
  children: ReactNode;
  /** Logged-out preview flag (kept for API compatibility; nav reads the session). */
  guest?: boolean;
}) {
  return (
    // Dark "app-shell chrome": the outer canvas, top bar, ticker and footer sit
    // on the deep-navy frame; the main content is a light sheet floating inside.
    <div className="chrome-dark min-h-screen bg-background bg-grid">
      <div className="pointer-events-none fixed inset-0 bg-aurora" />
      <div className="relative flex min-h-screen flex-col">
        <TopNav />

        {/* Live market ticker banner across the top of the app (dark chrome) */}
        <MarketTicker compact />

        <main className="mx-auto w-full max-w-7xl flex-1 px-2 py-4 sm:px-4 sm:py-5 lg:px-6">
          {/* Light content sheet — the "main viewing part" stays exactly as-is */}
          <div className="content-light min-h-[72vh] rounded-2xl bg-background px-4 py-5 text-foreground shadow-[0_10px_44px_-16px_rgba(0,0,0,0.55)] ring-1 ring-black/5 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>

        {/* Persistent NZ financial disclaimer across every authenticated page */}
        <DisclaimerNotice variant="bar" />
      </div>
    </div>
  );
}
