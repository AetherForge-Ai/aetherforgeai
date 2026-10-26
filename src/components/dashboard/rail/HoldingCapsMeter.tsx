"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { holdingsMeterState } from "@/lib/holding-caps";

/** b68 G-07: reads HOLDING_CAPS_V2 from the server once. OFF (the production default) renders nothing new. */
export function useHoldingCapsFlag(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/flags/holding-caps", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: { holdingCapsV2?: boolean } }>) : null))
      .then((j) => {
        if (live) setOn(j?.data?.holdingCapsV2 === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return on;
}

/** b68 G-07: holdings caps meter. Shown only when HOLDING_CAPS_V2=1. */
export function HoldingCapsMeter({ used, limit }: { used: number; limit: number | null }) {
  const s = holdingsMeterState(used, limit);
  const bar = s.level === "full" ? "bg-destructive" : s.level === "near" ? "bg-amber-500" : "bg-primary";
  return (
    <div className="col-span-2 mt-1.5" data-g07-meter={s.level}>
      {s.level !== "unlimited" ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Holdings used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.percent}
          aria-valuetext={s.text}
        >
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${s.percent}%` }} />
        </div>
      ) : null}
      {s.hint ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {s.hint}{" "}
          {s.level === "full" ? (
            <Link href="/pricing" className="underline">
              Pricing
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
