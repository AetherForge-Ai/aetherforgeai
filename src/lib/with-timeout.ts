/**
 * Resolve to `fallback` when `work` takes longer than `ms` (or throws), so a slow vendor
 * never holds a public page past its budget. The page then renders its "—" fallback.
 */
export async function withTimeout<T>(work: Promise<T> | (() => Promise<T>), ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const p = typeof work === "function" ? work() : work;
  try {
    return await Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
