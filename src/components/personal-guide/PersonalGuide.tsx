"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { PourAnimation } from "./PourAnimation";
import { PersonalGuideChat } from "./PersonalGuideChat";
import "./personal-guide.css";

const STORAGE_KEY = "af-personal-guide-v1";
const DELAY_MS = 15_000;

type Phase = "idle" | "pour" | "chat" | "dismissed";

/**
 * Homepage-only lead-capture Personal Guide.
 * Appears after 15s on `/`, once per browser session (sessionStorage).
 * Skipped for signed-in members (not disruptive on dashboard / logged-in home).
 * prefers-reduced-motion: skip pour, show chat immediately.
 */
export function PersonalGuide() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [phase, setPhase] = useState<Phase>("idle");

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
    setPhase("dismissed");
  }, []);

  useEffect(() => {
    if (pathname !== "/") {
      setPhase("idle");
      return;
    }

    if (isPending) return;
    if (session?.user) {
      setPhase("dismissed");
      return;
    }

    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* ignore */
    }

    try {
      const prior = sessionStorage.getItem(STORAGE_KEY);
      if (prior === "dismissed" || prior === "shown") {
        setPhase("dismissed");
        return;
      }
    } catch {
      /* ignore */
    }

    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, "shown");
      } catch {
        /* ignore */
      }
      setPhase(reduced ? "chat" : "pour");
    }, DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pathname, session, isPending]);

  const onPourDone = useCallback(() => setPhase("chat"), []);

  if (pathname !== "/" || phase === "idle" || phase === "dismissed") {
    return null;
  }

  return (
    <>
      {phase === "pour" && <PourAnimation onDone={onPourDone} />}
      {phase === "chat" && <PersonalGuideChat onDismiss={dismiss} />}
    </>
  );
}
