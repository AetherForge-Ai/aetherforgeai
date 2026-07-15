"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  // Better Auth redirects here after processing the verification link. On failure
  // (expired/invalid token) it appends ?error=... to the callback URL.
  const errorParam = searchParams.get("error");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (errorParam) {
      console.warn(`[verify-email] Verification failed: ${errorParam}`);
      setFailed(true);
    } else {
      console.log("[verify-email] Email verified successfully.");
    }
  }, [errorParam]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-br from-background to-muted/20">
      <Link href="/" className="transition-opacity hover:opacity-90">
        <BrandLogo animated markClassName="size-12" wordmarkClassName="text-xl" />
      </Link>

      {failed ? (
        <Card className="w-full max-w-md border shadow-xl">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-destructive/10 ring-1 ring-destructive/20">
              <XCircle className="size-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Verification link expired</CardTitle>
            <CardDescription className="text-base">
              This verification link is invalid or has already been used. You can request a fresh
              one from the login screen.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-3 pt-4">
            <Button asChild className="w-full h-11 text-base font-semibold">
              <Link href="/login">Back to Log In</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full h-11">
              <Link href="/">Return to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="w-full max-w-md border shadow-xl">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <CheckCircle2 className="size-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Email verified</CardTitle>
            <CardDescription className="text-base">
              Your account is now active. Welcome to AetherForge AI — your portfolio command center
              is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center justify-center gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Your email is confirmed and secured.
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button asChild className="w-full h-11 text-base font-semibold">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full h-11">
              <Link href="/login">Log In</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background to-muted/20">
          <Card className="w-full max-w-md border shadow-xl">
            <CardHeader className="space-y-2 text-center pb-6">
              <CardTitle className="text-2xl font-bold tracking-tight">Verifying…</CardTitle>
              <CardDescription>Confirming your email address.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
