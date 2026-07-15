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
    <div className="min-h-screen bg-grid">
      <div className="pointer-events-none fixed inset-0 bg-aurora" />
      <div className="relative flex min-h-screen flex-col">
        <TopNav />

        {/* Live market ticker banner across the top of the app */}
        <MarketTicker compact />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">{children}</main>

        {/* Persistent NZ financial disclaimer across every authenticated page */}
        <DisclaimerNotice variant="bar" />
      </div>
    </div>
  );
}
