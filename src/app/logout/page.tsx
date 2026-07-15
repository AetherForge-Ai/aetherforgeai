"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckCircle2, ShieldCheck, LogIn, Loader2 } from "lucide-react";

export default function LogoutPage() {
  const [done, setDone] = useState(false);
  const ranRef = useRef(false); // guard against React StrictMode double-invoke

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        await signOut();
        console.log("[logout] Session cleared.");
      } catch (err) {
        // Even if the network call fails, we still show the confirmation — the
        // cookie is cleared client-side and the user intended to leave.
        console.error("[logout] signOut error (showing confirmation anyway):", err);
      } finally {
        setDone(true);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-br from-background to-muted/20">
      <Link href="/" className="transition-opacity hover:opacity-90">
        <BrandLogo animated markClassName="size-12" wordmarkClassName="text-xl" />
      </Link>

      {!done ? (
        <Card className="w-full max-w-md border shadow-xl">
          <CardHeader className="space-y-3 text-center py-10">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <CardTitle className="text-xl font-semibold tracking-tight">Signing you out…</CardTitle>
            <CardDescription>Securely closing your session.</CardDescription>
          </CardHeader>
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
              <Link href="/login">
                <LogIn className="size-5" />
                Log In Again
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full h-11">
              <Link href="/">Return to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
