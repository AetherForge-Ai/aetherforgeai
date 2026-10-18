"use client";

import { useEffect, useState, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import { useDocumentSessionMode } from "@/components/DocumentSession";

const DELAY_MS = 15_000;
const STORAGE_KEY = "af-help-assistant-v3";

/**
 * M-1: the guide's chat bundle is requested only after the same 15s wait the
 * assistant already uses, and never for a member document. The page's first
 * JS does not include it.
 */
export function LazyPersonalGuide() {
  const pathname = usePathname();
  const mode = useDocumentSessionMode();
  const [Guide, setGuide] = useState<ComponentType<{ armed?: boolean }> | null>(null);

  useEffect(() => {
    if (pathname !== "/" || mode === "member") return;
    try {
      const prior = sessionStorage.getItem(STORAGE_KEY);
      if (prior === "dismissed" || prior === "shown") return;
    } catch {
      /* ignore */
    }
    const timer = window.setTimeout(() => {
      void import("./PersonalGuide").then((mod) => setGuide(() => mod.PersonalGuide));
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, mode]);

  if (!Guide) return null;
  return <Guide armed />;
}
