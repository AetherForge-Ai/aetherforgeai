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
    const leave = () => {
      setSignedOut(true);
      const next = `/login?redirect=${encodeURIComponent(redirectTo)}`;
      if (window.location.pathname !== "/login") window.location.replace(next);
    };
    const check = async () => {
      try {
        const res = await fetch("/api/session", { credentials: "include", cache: "no-store" });
        // b39 P3: a 401 is a definite "signed out" (it used to be ignored, so /settings stayed up).
        if (res.status === 401) {
          if (!cancelled) leave();
          return;
        }
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { user?: { id?: string } | null } | null;
        if (cancelled || data?.user?.id) return;
        leave();
      } catch {
        /* keep the server render; a blip is not a logout */
      }
    };
    void check();
    // b39 P3: after sign-out, Back (bfcache restore) or returning to the tab shows the old page
    // without a new render. Re-check then, so /settings leaves for /login promptly.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
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
