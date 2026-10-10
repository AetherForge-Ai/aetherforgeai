"use client";

import { useEffect, useRef, useState } from "react";
import { clearClientUserState } from "@/lib/client-user-state";
import { invalidateLiveSessionProbe } from "@/lib/auth-refresh";
import { classifySessionProbe, logoutFinish, type SessionProbe } from "@/lib/logout-finish";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckCircle2, ShieldCheck, LogIn, Loader2 } from "lucide-react";

const LOGOUT_TIMEOUT_MS = 8000;

function logoutSignal(): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(LOGOUT_TIMEOUT_MS);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);
  return controller.signal;
}

async function probeSession(): Promise<SessionProbe> {
  invalidateLiveSessionProbe();
  try {
    const res = await fetch("/api/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: logoutSignal(),
    });
    const data = res.ok
      ? ((await res.json().catch(() => null)) as { user?: { id?: string } | null } | null)
      : null;
    return classifySessionProbe(res.status, data?.user?.id);
  } catch {
    return "unknown";
  }
}

async function postLogout(): Promise<boolean> {
  try {
    const res = await fetch("/api/session/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: logoutSignal(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function LogoutPage() {
  const [phase, setPhase] = useState<"working" | "done" | "error">("working");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const done = new URLSearchParams(window.location.search).get("done") === "1";
    if (done) {
      setPhase("done");
      return;
    }

    (async () => {
      try {
        clearClientUserState();
        invalidateLiveSessionProbe();
        // pull-check:batch1-2026-10-11 R12 — a hung probe must not leave this spinner up.
        let posted = await postLogout();
        let probe: SessionProbe = posted ? await probeSession() : "unknown";
        let step = logoutFinish(posted, probe, false);
        if (step === "retry") {
          posted = await postLogout();
          probe = posted ? await probeSession() : "unknown";
          step = logoutFinish(posted, probe, true);
        }
        if (step !== "done") {
          setPhase("error");
          return;
        }
        clearClientUserState();
        // Full navigation drops the client router cache of the signed-in dashboard.
        window.location.replace("/logout?done=1");
      } catch (err) {
        console.error("[logout] signOut error:", err);
        setPhase("error");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-br from-background to-muted/20">
      <a href="/" className="transition-opacity hover:opacity-90">
        <BrandLogo animated markClassName="size-12" wordmarkClassName="text-xl" />
      </a>

      {phase === "working" ? (
        <Card className="w-full max-w-md border shadow-xl">
          <CardHeader className="space-y-3 text-center py-10">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <CardTitle className="text-xl font-semibold tracking-tight">Signing you out…</CardTitle>
            <CardDescription>Securely closing your session.</CardDescription>
          </CardHeader>
        </Card>
      ) : phase === "error" ? (
        <Card className="w-full max-w-md border shadow-xl">
          <CardHeader className="space-y-4 text-center pb-2">
            <CardTitle className="text-2xl font-bold tracking-tight">Sign-out did not finish</CardTitle>
            <CardDescription className="text-base">
              This browser still has a session. Portfolio pages stay closed until sign-out completes.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-3 pt-4">
            <Button className="w-full h-12 text-base font-semibold" onClick={() => window.location.assign("/logout")}>
              Try sign-out again
            </Button>
            <Button asChild variant="ghost" className="w-full h-11">
              <a href="/">Return to Home</a>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="w-full max-w-md border shadow-xl animate-in fade-in zoom-in-95 duration-300">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <CheckCircle2 className="size-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              You have been successfully logged out
            </CardTitle>
            <CardDescription className="text-base">
              Thanks for using AetherForge AI. Your session has been safely closed.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 mt-0.5 shrink-0 text-primary" />
              <span>
                For your security, your session has been fully ended on this device. If you&apos;re on
                a shared or public computer, we recommend closing this browser window.
              </span>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-4">
            <Button asChild className="w-full h-12 text-base font-semibold">
              <a href="/login">
                <LogIn className="size-5" />
                Log In Again
              </a>
            </Button>
            <Button asChild variant="ghost" className="w-full h-11">
              <a href="/">Return to Home</a>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
