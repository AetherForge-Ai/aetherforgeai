"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { confirmSessionUser, type LiveSessionUser } from "@/lib/auth-refresh";

/**
 * Confirmed session owner for this browser.
 * Undefined while the probe is in flight. Never falls back to the session atom,
 * which can still name the previous paper book after a shared-browser switch.
 */
export function useLiveSessionUser(): { user: LiveSessionUser | null | undefined } {
  const pathname = usePathname();
  const { data: session } = useSession();
  const atomUserId = session?.user?.id;
  const [user, setUser] = useState<LiveSessionUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setUser(undefined);
    confirmSessionUser(atomUserId).then((next) => {
      if (!cancelled) setUser(next);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, atomUserId]);

  return { user };
}
