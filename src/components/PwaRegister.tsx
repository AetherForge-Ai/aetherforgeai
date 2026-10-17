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

/** Goal b16 M-10: called on sign-out. Removes every Cache Storage entry this site holds. */
export async function clearOfflineCaches(): Promise<void> {
  try {
    navigator.serviceWorker?.controller?.postMessage("aetherforge-clear");
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    /* nothing cached */
  }
}
