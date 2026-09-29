"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLiveSessionUser } from "@/lib/use-live-session";

/** Where the free signup starts. Pricing hosts the free-plan button, which registers the chosen bot. */
export const MEMBER_SIGNUP_HREF = "/pricing";

export const MEMBER_DASHBOARD_COPY =
  "Dashboard is part of the service available to signed up members — You can sign up right now for free by clicking the link";

export function MemberDashboardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dashboard</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-foreground sm:text-base">{MEMBER_DASHBOARD_COPY}</p>
        <Button asChild className="font-semibold">
          <Link href={MEMBER_SIGNUP_HREF}>Sign up free</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Signed-out Dashboard clicks open the member prompt.
 * A confirmed session goes to /dashboard. A session that is still loading waits.
 */
export function useMemberDashboardPrompt() {
  const { user } = useLiveSessionUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wait, setWait] = useState(false);

  useEffect(() => {
    if (!wait || user === undefined) return;
    setWait(false);
    if (user) router.push("/dashboard");
    else setOpen(true);
  }, [wait, user, router]);

  function onDashboardClick(event: React.MouseEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (user) {
      router.push("/dashboard");
      return;
    }
    if (user === undefined) setWait(true);
    else setOpen(true);
  }

  return {
    open,
    setOpen,
    onDashboardClick,
    dialog: <MemberDashboardDialog open={open} onOpenChange={setOpen} />,
  };
}

/** Button that opens the member prompt when signed out, and /dashboard when signed in. */
export function DashboardEntryButton({
  children,
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "outline";
  size?: "default" | "lg";
}) {
  const { onDashboardClick, dialog } = useMemberDashboardPrompt();
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={onDashboardClick}>
        {children}
      </Button>
      {dialog}
    </>
  );
}
