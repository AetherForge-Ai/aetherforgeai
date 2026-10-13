"use client";

import { useEffect } from "react";

/** Keep the page where it was when a drawer or dialog opens and when it closes. */
export function useRestoreScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const frame = window.requestAnimationFrame(() => {
      if (window.scrollY !== y) window.scrollTo(0, y);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - y) > 8) window.scrollTo(0, y);
      });
    };
  }, [open]);
}
