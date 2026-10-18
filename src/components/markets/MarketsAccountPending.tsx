"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** b38 REG-1 (Chief ruling 4): the session lookup passed its 3 s cap. Never the signed-out view:
 * a small loading state, then the server render is re-requested and fills in the signed-in page. */
export const ACCOUNT_PENDING_RETRY_MS = 1_500;
export const ACCOUNT_PENDING_MAX_TRIES = 4;

export function MarketsAccountPending() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= ACCOUNT_PENDING_MAX_TRIES) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, ACCOUNT_PENDING_RETRY_MS);
    return () => clearTimeout(t);
  }, [tries, router]);
  return (
    <main className="mx-auto max-w-3xl p-6" aria-busy="true" data-markets-account-pending>
      <h1 className="text-xl font-semibold">Markets</h1>
      {tries < ACCOUNT_PENDING_MAX_TRIES ? (
        <p className="mt-2 text-sm opacity-80" role="status">Loading your account…</p>
      ) : (
        <p className="mt-2 text-sm opacity-80" role="status">
          Your account is taking longer than usual. <a className="underline" href="/markets">Reload the page</a>.
        </p>
      )}
    </main>
  );
}
