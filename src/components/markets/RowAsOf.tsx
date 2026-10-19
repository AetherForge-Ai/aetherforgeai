"use client";

import { useEffect, useState } from "react";
import { rowAsOfNow } from "@/lib/row-delay-label";

/** b46 H-1 (b): the row's as-of text, re-evaluated against the browser clock on render and every 30 s. */
export function RowAsOf({ source, asOf, quotedAt }: { source?: string; asOf?: string; quotedAt?: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const text = quotedAt !== undefined && now != null ? rowAsOfNow({ asOf, quotedAt }, now).asOf : asOf;
  return <>{source ? `${source}${text ? ` · ${text}` : ""}` : text || "Not in this response"}</>;
}
