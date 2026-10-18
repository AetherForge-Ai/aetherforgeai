/**
 * b30 H-4: start the report list request when the dashboard mounts, in parallel with the
 * book, instead of after the (lazy) Report Center chunk loads. Report Center takes the
 * in-flight request once; a prefetch older than PREFETCH_TTL_MS is ignored.
 */
import { api } from "@/lib/api";

export const REPORTS_PREFETCH_TTL_MS = 10_000;
let pending: { at: number; work: Promise<unknown> } | null = null;

export function prefetchReportsList(now = Date.now()): void {
  if (pending && now - pending.at < REPORTS_PREFETCH_TTL_MS) return;
  pending = { at: now, work: api.get("/api/reports") };
}

export function takePrefetchedReports<T>(now = Date.now()): Promise<T> | null {
  const hit = pending;
  pending = null;
  if (!hit || now - hit.at >= REPORTS_PREFETCH_TTL_MS) return null;
  return hit.work as Promise<T>;
}
