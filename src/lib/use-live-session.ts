"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { confirmSessionUser, type LiveSessionUser } from "@/lib/auth-refresh";

/**
 * Confirmed session owner for this browser.
 * Undefined while the probe is in flight. The better-auth session atom is not
 * read: subscribing to it fetches the rotating get-session, which can delete
 * the token, and its cache can name the previous paper book.
 */
export function useLiveSessionUser(): { user: LiveSessionUser | null | undefined } {
  const pathname = usePathname();
  const [user, setUser] = useState<LiveSessionUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setUser(undefined);
    confirmSessionUser(null).then((next) => {
      if (!cancelled) setUser(next);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return { user };
}
