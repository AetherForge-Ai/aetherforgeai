"use client";

/**
 * Stripe Success Page — shown after a successful subscription checkout.
 * Redirects into the dashboard so the user lands on their portfolio.
 */

import { useEffect, useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

function SuccessContent() {
  const [countdown, setCountdown] = useState(6);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = "/dashboard";
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-grid px-4">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/60 p-8 text-center backdrop-blur-xl shadow-glow">
        <div className="flex justify-center">
          <BrandLogo />
        </div>
        <div className="mx-auto mt-8 grid size-16 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="size-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold">Welcome to AetherForge Pro</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your subscription is active. You now have full access to the analytics dashboard, AI
          research, and your market assistant.
        </p>

        <Button asChild size="lg" className="mt-7 h-12 w-full font-semibold shadow-glow">
          <Link href="/dashboard">
            Go to dashboard <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Redirecting in {countdown}s…
        </p>
      </div>
    </div>
  );
}

export default function StripeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
