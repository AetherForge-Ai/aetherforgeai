"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  MEMBER_DASHBOARD_COPY,
  MEMBER_DASHBOARD_HEADING,
  MEMBER_SIGNIN_HREF,
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
          <h1 className="font-display text-2xl font-bold tracking-tight">{MEMBER_DASHBOARD_HEADING}</h1>
          <p className="mt-4 text-sm leading-relaxed text-foreground sm:text-base">{MEMBER_DASHBOARD_COPY}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className="h-11 px-6 font-semibold">
              <Link href={MEMBER_SIGNUP_HREF}>Sign up free</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-6 font-semibold">
              <Link href={MEMBER_SIGNIN_HREF}>Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
