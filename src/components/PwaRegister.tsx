"use client";

import { useEffect } from "react";

const SHELL_UPDATED_KEY = "aetherforge-shell-updated";

/** Registers the shell worker. Does not subscribe to push. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (navigator.onLine) {
      window.localStorage.setItem(SHELL_UPDATED_KEY, new Date().toISOString());
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

export { SHELL_UPDATED_KEY };
