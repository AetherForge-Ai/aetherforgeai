"use client";

import { useEffect, useState } from "react";

export const ASSISTANT_QUOTA_EVENT = "af:assistant-quota";

/** b26 L-4: Market Assistant queries used / plan limit, updated in place after each question. */
export function AssistantQueryCounter({ className }: { className?: string }) {
  const [q, setQ] = useState<{ used: number; limit: number | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/chat?quota=1", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(5000) })
        .then((r) => r.json() as Promise<{ ok?: boolean; data: { used?: number; limit?: number | null } }>)
        .then((body) => {
          if (!live || !body?.ok) throw new Error("quota");
          setQ({ used: Number(body.data.used) || 0, limit: typeof body.data.limit === "number" ? body.data.limit : null });
          setFailed(false);
        })
        .catch(() => live && setFailed(true));
    void load();
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent<{ used: number; limit: number | null }>).detail;
      if (d && typeof d.used === "number") setQ({ used: d.used, limit: d.limit });
      else void load();
    };
    window.addEventListener(ASSISTANT_QUOTA_EVENT, onUpdate);
    return () => {
      live = false;
      window.removeEventListener(ASSISTANT_QUOTA_EVENT, onUpdate);
    };
  }, []);
  if (failed && !q) return null;
  if (!q) return null;
  return (
    <span className={className} data-assistant-counter aria-live="polite">
      Market Assistant: {q.used} / {q.limit == null ? "unlimited" : q.limit} queries this month
    </span>
  );
}
