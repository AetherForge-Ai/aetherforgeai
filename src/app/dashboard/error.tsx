"use client";

import { RouteErrorPanel } from "@/components/RouteErrorPanel";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorPanel error={error} reset={reset} title="This dashboard panel did not load" />;
}
