"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { PortfolioCoachChat } from "./PortfolioCoachChat";
import "@/components/personal-guide/personal-guide.css";
import { BOT_HEADMASTER_AVATAR } from "@/assets/files";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "af-portfolio-coach-open-v1";

/**
 * Logged-in Portfolio Execution Coach — gold chrome matching Help Assistant.
 * Minimized FAB by default; expands on click across authenticated dashboard routes.
 */
export function PortfolioCoach() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const onDashboard =
    !!pathname &&
    (pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/") ||
      pathname === "/headmaster" ||
      pathname.startsWith("/headmaster") ||
      pathname === "/settings" ||
      pathname.startsWith("/settings") ||
      pathname === "/market-news" ||
      pathname.startsWith("/market-news"));

  useEffect(() => {
    if (isPending) return;
    if (!session?.user || !onDashboard) {
      setOpen(false);
      setReady(false);
      return;
    }
    setReady(true);
    // Always start minimized so the dashboard stays calm; user opens on click.
    setOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "0");
    } catch {
      /* ignore */
    }
  }, [session, isPending, onDashboard]);

  const minimize = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "0");
    } catch {
      /* ignore */
    }
  }, []);

  const expand = useCallback(() => {
    setOpen(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (!ready || !session?.user || !onDashboard) {
    return null;
  }

  if (open) {
    return <PortfolioCoachChat onMinimize={minimize} />;
  }

  return (
    <button
      type="button"
      onClick={expand}
      className={cn(
        "pg-chat-in fixed bottom-4 right-3 z-[70] flex items-center gap-2.5 rounded-full border border-amber-400/45",
        "bg-[#06261a]/95 px-3 py-2.5 text-left shadow-[0_0_0_1px_rgba(245,158,11,0.28),0_16px_40px_rgba(0,0,0,0.5)]",
        "backdrop-blur-md transition hover:border-amber-300/60 hover:bg-[#0a3d2a] sm:right-5"
      )}
      aria-label="Open Portfolio Execution Coach"
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
          Portfolio Coach
        </span>
        <span className="block text-[10px] text-emerald-100/65">
          Click to open · minimized
        </span>
      </span>
    </button>
  );
}
