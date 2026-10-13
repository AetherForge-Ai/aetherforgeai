"use client";

import { useEffect } from "react";

/** Keep the page where it was when a drawer closes after the lock jumps it to the top. */
export function useRestoreScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    return () => {
      window.requestAnimationFrame(() => {
        if (window.scrollY === 0 && y > 40) window.scrollTo(0, y);
      });
    };
  }, [open]);
}
