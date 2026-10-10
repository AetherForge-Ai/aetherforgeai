/**
 * What a dashboard panel may say before its fetch finishes (H4).
 * An empty book is only announced after the response arrives.
 */

export type SurfacePhase = "loading" | "empty" | "ready";

export function surfaceWhileLoading(loaded: boolean, isEmpty: boolean): SurfacePhase {
  if (!loaded) return "loading";
  if (isEmpty) return "empty";
  return "ready";
}

export function reportRunStatus(loaded: boolean, line: string): string {
  if (!loaded) return "Loading…";
  return line;
}
