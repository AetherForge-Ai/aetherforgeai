"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * If the document was painted with a member shell but the stable session
 * probe says nobody is signed in, leave for the login page. A network
 * failure does not count as signed out.
 */
export function RedirectSignedOut({
  redirectTo,
  children,
}: {
  redirectTo: string;
  children: ReactNode;
}) {
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { user?: { id?: string } | null } | null;
        if (cancelled || data?.user?.id) return;
        setSignedOut(true);
        const next = `/login?redirect=${encodeURIComponent(redirectTo)}`;
        if (window.location.pathname !== "/login") window.location.replace(next);
      } catch {
        /* keep the server render; a blip is not a logout */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [redirectTo]);

  if (signedOut) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-base font-semibold">Taking you to sign in…</p>
        <p className="text-sm text-muted-foreground">Account pages need a signed-in session.</p>
      </div>
    );
  }

  return <>{children}</>;
}
