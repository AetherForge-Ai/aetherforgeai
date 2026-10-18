"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDocumentSessionMode } from "@/components/DocumentSession";
import { confirmPageSessionStrict, type LiveSessionUser } from "@/lib/auth-refresh";

/** b29 H-4: last user this tab confirmed. A session-service outage keeps it instead of flipping the header to "Log in". */
let lastConfirmedUser: LiveSessionUser | null = null;
export function __resetLiveSessionForTests() {
  lastConfirmedUser = null;
}

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
    confirmPageSessionStrict().then(
      (next) => {
        lastConfirmedUser = next;
        if (!cancelled) setUser(next);
      },
      () => {
        // Unknown is not signed out: keep the last confirmed user (or stay neutral).
        if (!cancelled) setUser(lastConfirmedUser ?? undefined);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pathname, mode]);

  if (mode === "guest") return { user: null };
  return { user };
}
