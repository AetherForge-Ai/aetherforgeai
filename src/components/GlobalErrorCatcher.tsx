"use client";

import { useEffect } from "react";
import { clientErrorSummary, shouldIgnoreClientError } from "@/lib/client-error";

/**
 * Global Error Catcher - prevents Next.js error overlay and logs errors silently
 * Catches runtime errors and promise rejections without breaking UI.
 * Image/script load failures and undefined/empty errors are ignored so a
 * missing coin icon does not look like an uncaught exception.
 */
export function GlobalErrorCatcher() {
  useEffect(() => {
    // Prevent Next.js error overlay using stopImmediatePropagation
    // This must run BEFORE Next.js attaches its listeners
    const handleError = (event: Event) => {
      const asError = event as ErrorEvent;
      if (shouldIgnoreClientError({ error: asError.error, message: asError.message, filename: asError.filename, target: event.target })) {
        event.stopImmediatePropagation();
        return;
      }
      console.error("[Global Error Handler] Unhandled error:", clientErrorSummary(asError));
      console.error("[Global Error Handler] Source:", asError.filename, "Line:", asError.lineno, "Col:", asError.colno);

      // Stop Next.js overlay from showing
      event.stopImmediatePropagation();
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason == null || reason === "" || reason === "undefined") {
        event.stopImmediatePropagation();
        return;
      }
      const summary = reason instanceof Error ? reason.message : String(reason);
      console.error("[Global Error Handler] Unhandled promise rejection:", summary || "Unknown rejection");

      // Stop Next.js overlay from showing
      event.stopImmediatePropagation();
    };

    // Add listeners with capture phase to run before Next.js
    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleRejection, true);

    return () => {
      window.removeEventListener("error", handleError, true);
      window.removeEventListener("unhandledrejection", handleRejection, true);
    };
  }, []);

  return null;
}
