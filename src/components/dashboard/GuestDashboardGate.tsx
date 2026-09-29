"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  MEMBER_DASHBOARD_COPY,
  MEMBER_SIGNUP_HREF,
  MemberDashboardDialog,
} from "@/components/dashboard/MemberDashboardPrompt";

/**
 * Logged-out /dashboard. Opens the member prompt immediately.
 * No portfolio, no account name, and no balances.
 */
export function GuestDashboardGate() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <MemberDashboardDialog open={open} onOpenChange={setOpen} />
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-4 text-sm leading-relaxed text-foreground sm:text-base">{MEMBER_DASHBOARD_COPY}</p>
          <Button asChild className="mt-8 h-11 px-6 font-semibold">
            <Link href={MEMBER_SIGNUP_HREF}>Sign up free</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
