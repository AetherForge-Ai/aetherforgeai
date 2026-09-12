"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { PourAnimation } from "./PourAnimation";
import { PersonalGuideChat } from "./PersonalGuideChat";
import "./personal-guide.css";

const STORAGE_KEY = "af-help-assistant-v3";
const DELAY_MS = 15_000;

type Phase = "idle" | "pour" | "chat" | "dismissed";

/**
 * Homepage Help Assistant — lead capture + site how-to.
 * Sequence: 15s wait → dense gold dust pour from header to bottom →
 * dust builds into the open chat window → Help Assistant seated on title bar.
 */
export function PersonalGuide() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [showPour, setShowPour] = useState(false);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
    setPhase("dismissed");
    setShowPour(false);
  }, []);

  useEffect(() => {
    if (pathname !== "/") {
      setPhase("idle");
      setShowPour(false);
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
      if (reduced) {
        setPhase("chat");
        setShowPour(false);
      } else {
        setPhase("pour");
        setShowPour(true);
      }
    }, DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pathname, session, isPending]);

  const onBuilt = useCallback(() => {
    setPhase("chat");
    // Let the canvas fade out while the real window takes over
    window.setTimeout(() => setShowPour(false), 420);
  }, []);

  if (pathname !== "/" || phase === "idle" || phase === "dismissed") {
    return null;
  }

  return (
    <>
      {showPour && <PourAnimation onBuilt={onBuilt} />}
      {phase === "chat" && (
        <PersonalGuideChat onDismiss={dismiss} showSeatedCharacter />
      )}
    </>
  );
}
