"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDocumentSessionMode } from "@/components/DocumentSession";
import { confirmSessionUser, type LiveSessionUser } from "@/lib/auth-refresh";

/**
 * Confirmed session owner for this browser.
 * Undefined while the probe is in flight. The better-auth session atom is not
 * read: subscribing to it fetches the rotating get-session, which can delete
 * the token, and its cache can name the previous paper book.
 *
 * A guest document never paints identity. The probe is skipped so a session
 * body that does not belong to this request cannot rename the nav or open
 * the assistant.
 */
export function useLiveSessionUser(): { user: LiveSessionUser | null | undefined } {
  const mode = useDocumentSessionMode();
  const pathname = usePathname();
  const [user, setUser] = useState<LiveSessionUser | null | undefined>(
    mode === "guest" ? null : undefined,
  );

  useEffect(() => {
    if (mode === "guest") {
      setUser(null);
      return;
    }
    let cancelled = false;
    setUser(undefined);
    confirmSessionUser(null).then((next) => {
      if (!cancelled) setUser(next);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, mode]);

  if (mode === "guest") return { user: null };
  return { user };
}
