"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { PortfolioCoachChat } from "./PortfolioCoachChat";
import { RiseAnimation } from "./RiseAnimation";
import "@/components/personal-guide/personal-guide.css";
import { BOT_HEADMASTER_AVATAR } from "@/assets/files";
import { cn } from "@/lib/utils";

const OPEN_KEY = "af-portfolio-coach-open-v1";
const RISE_KEY = "af-assistant-guide-rise-v1";

type Phase = "idle" | "rise" | "built";

/** Routes where the floating coach should stay hidden even if logged in. */
function isExcludedPath(pathname: string | null): boolean {
  if (!pathname) return true;
  const deny = [
    "/login",
    "/register",
    "/signup",
    "/sign-in",
    "/sign-up",
    "/api",
    "/own-the-bots/success",
  ];
  return deny.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Logged-in Assistant Guide — gold chrome matching Help Assistant.
 * Once per login session, gold dust rises from the bottom-right into the FAB
 * (opposite of Help Assistant's left-side pour). Available site-wide when signed in.
 */
export function PortfolioCoach() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showRise, setShowRise] = useState(false);

  const userId = session?.user?.id || session?.user?.email || null;
  const allowed = !!session?.user && !isExcludedPath(pathname);

  useEffect(() => {
    if (isPending) return;
    if (!allowed) {
      setHydrated(false);
      setOpen(false);
      setPhase("idle");
      setShowRise(false);
      return;
    }

    let wantOpen = false;
    try {
      wantOpen = sessionStorage.getItem(OPEN_KEY) === "1";
    } catch {
      wantOpen = false;
    }
    setOpen(wantOpen);

    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* ignore */
    }

    let alreadyRose = false;
    try {
      alreadyRose = sessionStorage.getItem(RISE_KEY) === "1";
    } catch {
      alreadyRose = false;
    }

    if (alreadyRose || reduced) {
      setPhase("built");
      setShowRise(false);
    } else {
      setPhase("rise");
      setShowRise(true);
    }

    setHydrated(true);
  }, [allowed, isPending]);

  const minimize = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(OPEN_KEY, "0");
    } catch {
      /* ignore */
    }
  }, []);

  const expand = useCallback(() => {
    setOpen(true);
    try {
      sessionStorage.setItem(OPEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const onBuilt = useCallback(() => {
    try {
      sessionStorage.setItem(RISE_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("built");
    window.setTimeout(() => setShowRise(false), 420);
  }, []);

  // Parent-level failsafe if the canvas never reports built.
  useEffect(() => {
    if (phase !== "rise") return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(RISE_KEY, "1");
      } catch {
        /* ignore */
      }
      setPhase("built");
      setShowRise(false);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (isPending || !hydrated || !allowed || !userId) {
    return null;
  }

  const uiReady = phase === "built";

  return (
    <>
      {showRise && (
        <RiseAnimation onBuilt={onBuilt} buildOpenChat={open} />
      )}

      {uiReady ? (
        <>
          <div className={cn(!open && "hidden")} aria-hidden={!open}>
            <PortfolioCoachChat onMinimize={minimize} userId={userId} />
          </div>

          {!open ? (
            <button
              type="button"
              onClick={expand}
              className={cn(
                "pg-chat-in fixed bottom-4 right-3 z-[70] flex items-center gap-2.5 rounded-full border border-amber-400/45",
                "bg-[#06261a]/95 px-3 py-2.5 text-left shadow-[0_0_0_1px_rgba(245,158,11,0.28),0_16px_40px_rgba(0,0,0,0.5)]",
                "backdrop-blur-md transition hover:border-amber-300/60 hover:bg-[#0a3d2a] sm:right-5"
              )}
              aria-label="Open Assistant Guide"
              title="Assistant Guide"
            >
              <span className="relative">
                <img
                  src={BOT_HEADMASTER_AVATAR}
                  alt=""
                  className="size-10 rounded-full border border-amber-400/40 object-cover"
                />
                <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-amber-400 text-amber-950 shadow">
                  <MessageSquareText className="size-2.5" />
                </span>
              </span>
              <span className="pr-1">
                <span className="block font-display text-xs font-bold tracking-wide text-amber-300">
                  Assistant Guide
                </span>
                <span className="block text-[10px] text-emerald-100/65">
                  Keeps your portfolio on track
                </span>
              </span>
            </button>
          ) : null}
        </>
      ) : null}
    </>
  );
}
