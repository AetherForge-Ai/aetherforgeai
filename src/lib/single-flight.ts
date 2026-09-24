/**
 * Share one in-flight promise across concurrent callers.
 * Used for session refresh so parallel 401s don't each rotate the cookie.
 */
export function createSingleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (!inflight) {
      const job = fn().finally(() => {
        if (inflight === job) inflight = null;
      });
      inflight = job;
    }
    return inflight;
  };
}
