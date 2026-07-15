"use client";

import { TopNav } from "@/components/TopNav";

/**
 * Marketing header. Deliberately a thin wrapper around the SINGLE global
 * <TopNav />, so the primary navigation bar is byte-for-byte identical on the
 * homepage, pricing, dashboard, portfolio, markets and projections — it never
 * changes shape or relocates into a sidebar between marketing and app.
 */
export function SiteHeader() {
  return <TopNav />;
}
