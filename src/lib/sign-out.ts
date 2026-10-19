"use client";

import { clearOfflineCaches } from "@/components/PwaRegister";
import { clearClientUserState } from "@/lib/client-user-state";

/** b43 (Chief ruling): each revoke attempt waits at most this long; one retry. */
export const SIGN_OUT_POST_MS = 5_000;
export const SIGN_OUT_OVERLAY_ID = "af-signing-out";

async function revokeOnce(ms: number): Promise<boolean> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), ms);
  try {
    const res = await fetch("/api/session/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
      signal: controller?.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const blockUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = "";
};

/** A full-screen "Signing out…" layer that takes every click while the revoke runs. */
function showOverlay(): () => void {
  if (typeof document === "undefined") return () => undefined;
  let el = document.getElementById(SIGN_OUT_OVERLAY_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = SIGN_OUT_OVERLAY_ID;
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-live", "assertive");
    el.setAttribute("aria-label", "Signing out");
    el.setAttribute("data-signing-out", "");
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(10,10,15,0.85);color:#fff;font:600 1.125rem/1.4 system-ui,sans-serif;cursor:progress;pointer-events:all";
    el.textContent = "Signing out…";
    document.body.appendChild(el);
  }
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  // Capture phase: nothing under the overlay (links, the router, keyboard shortcuts) gets the event.
  const events = ["click", "mousedown", "pointerdown", "keydown", "submit", "touchstart"] as const;
  for (const t of events) document.addEventListener(t, swallow, true);
  window.addEventListener("beforeunload", blockUnload);
  return () => {
    for (const t of events) document.removeEventListener(t, swallow, true);
    window.removeEventListener("beforeunload", blockUnload);
  };
}

let inFlight: Promise<boolean> | null = null;

/**
 * b43 (Chief ruling, sign-out race): Sign out shows a full-screen "Signing out…" overlay that blocks
 * clicks and navigation, AWAITS the server revoke (5 s, one retry; the server deletes the Totalum
 * session row and expires every auth cookie in that response), clears client auth state and caches,
 * then location.replace("/login"). Nothing navigates before the revoke has answered or timed out twice.
 */
export function signOutNow(opts: { navigate?: (url: string) => void; postMs?: number } = {}): Promise<boolean> {
  if (inFlight) return inFlight;
  const release = showOverlay();
  inFlight = (async () => {
    const ms = opts.postMs ?? SIGN_OUT_POST_MS;
    let ok = await revokeOnce(ms);
    if (!ok) ok = await revokeOnce(ms);
    try {
      clearClientUserState();
    } catch {
      /* nothing to clear */
    }
    await Promise.race([clearOfflineCaches().catch(() => undefined), new Promise((r) => setTimeout(r, 1_000))]);
    release();
    const go = opts.navigate ?? ((url: string) => window.location.replace(url));
    go(ok ? "/login" : "/logout");
    return ok;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
