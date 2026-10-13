"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old dashboard URLs open the one dashboard. The address bar updates in the browser. */
export function DashboardRedirect({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return (
    <p className="px-4 py-16 text-center text-sm text-muted-foreground">Opening the dashboard…</p>
  );
}
