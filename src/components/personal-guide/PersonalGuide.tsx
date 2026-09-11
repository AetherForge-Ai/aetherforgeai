"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { PourAnimation } from "./PourAnimation";
import { PersonalGuideChat } from "./PersonalGuideChat";
import "./personal-guide.css";

const STORAGE_KEY = "af-help-assistant-v2";
const DELAY_MS = 15_000;

type Phase =
  | "idle"
  | "pour"
  | "risen"
  | "window"
  | "jump"
  | "chat"
  | "dismissed";

/**
 * Homepage Help Assistant — lead capture + site how-to.
 * Sequence: 15s wait → dense gold/silver pour → pool → avatar rises →
 * chat window appears bottom-left → avatar jumps onto the title bar.
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

  const onAssembled = useCallback(() => {
    setPhase("risen");
  }, []);

  // Hold the finished avatar mid-page, then open the chat window.
  useEffect(() => {
    if (phase !== "risen") return;
    const t = window.setTimeout(() => setPhase("window"), 800);
    return () => window.clearTimeout(t);
  }, [phase]);

  // After the window is visible, jump into the title bar.
  useEffect(() => {
    if (phase !== "window") return;
    const t = window.setTimeout(() => setPhase("jump"), 450);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "jump") return;
    const t = window.setTimeout(() => setPhase("chat"), 850);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (pathname !== "/" || phase === "idle" || phase === "dismissed") {
    return null;
  }

  const showStanding = phase === "pour" || phase === "risen" || phase === "window";
  const showJump = phase === "jump";
  const showChat =
    phase === "window" || phase === "jump" || phase === "chat";

  return (
    <>
      {showStanding && <PourAnimation onAssembled={onAssembled} />}
      {showJump && (
        <PourAnimation onAssembled={() => {}} jumping avatarOnly />
      )}
      {showChat && (
        <PersonalGuideChat
          onDismiss={dismiss}
          showSeatedCharacter={phase === "chat"}
        />
      )}
    </>
  );
}
