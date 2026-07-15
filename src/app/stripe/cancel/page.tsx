"use client";

/**
 * Stripe Cancel Page — shown when a user backs out of checkout.
 */

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { XCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function StripeCancelPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-grid px-4">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/60 p-8 text-center backdrop-blur-xl">
        <div className="flex justify-center">
          <BrandLogo />
        </div>
        <div className="mx-auto mt-8 grid size-16 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
          <XCircle className="size-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold">Checkout canceled</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No charges were made. You can pick up where you left off whenever you're ready.
        </p>

        <div className="mt-7 space-y-3">
          <Button asChild size="lg" className="h-12 w-full font-semibold">
            <Link href="/pricing">View plans again</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" /> Back to home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
