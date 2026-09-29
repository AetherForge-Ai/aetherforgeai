"use client";

import * as React from "react";
import { createTurnController, describeTurnFailure } from "@/lib/headmaster-trust";

export type TurnRunResult =
  | { status: "ignored" }
  | { status: "ok"; text: string }
  | { status: "timeout" | "cancelled" | "error"; message: string };

/**
 * Shared recovery for Strategist quick prompts and the Assistant Guide.
 * The draft stays in the composer until a successful reply, including after
 * timeout, cancel, or error.
 */
export function useRecoverableTurn() {
  const [draft, setDraft] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "working" | "error">("idle");
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [retryPrompt, setRetryPrompt] = React.useState<string | null>(null);
  const phaseRef = React.useRef(phase);
  const abortRef = React.useRef<ReturnType<typeof createTurnController> | null>(null);
  const tickRef = React.useRef<number | null>(null);
  phaseRef.current = phase;

  const stopTick = React.useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  React.useEffect(() => () => {
    stopTick();
    abortRef.current?.finish();
  }, [stopTick]);

  const cancel = React.useCallback(() => {
    abortRef.current?.cancel();
  }, []);

  const run = React.useCallback(
    async (
      prompt: string,
      exec: (signal: AbortSignal) => Promise<{ ok: boolean; text?: string; error?: string }>
    ): Promise<TurnRunResult> => {
      const msg = prompt.trim();
      if (!msg || phaseRef.current === "working") return { status: "ignored" };
      setDraft(msg);
      setPhase("working");
      phaseRef.current = "working";
      setNotice(null);
      setRetryPrompt(null);
      setElapsedSec(0);
      const started = Date.now();
      stopTick();
      tickRef.current = window.setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - started) / 1000));
      }, 250);
      const handle = createTurnController();
      abortRef.current = handle;
      try {
        const result = await exec(handle.signal);
        const aborted = handle.signal.aborted;
        handle.finish();
        if (aborted) {
          const kind = handle.timedOut ? "timeout" : "cancelled";
          const message = describeTurnFailure(kind);
          setPhase("error");
          phaseRef.current = "error";
          setNotice(message);
          setRetryPrompt(msg);
          setDraft(msg);
          return { status: kind, message };
        }
        if (!result.ok || !result.text) {
          const message = describeTurnFailure("error", result.error);
          setPhase("error");
          phaseRef.current = "error";
          setNotice(message);
          setRetryPrompt(msg);
          setDraft(msg);
          return { status: "error", message };
        }
        setDraft("");
        setPhase("idle");
        phaseRef.current = "idle";
        setNotice(null);
        setRetryPrompt(null);
        return { status: "ok", text: result.text };
      } catch (err) {
        handle.finish();
        const message = describeTurnFailure(
          "error",
          err instanceof Error ? err.message : "Request failed"
        );
        setPhase("error");
        phaseRef.current = "error";
        setNotice(message);
        setRetryPrompt(msg);
        setDraft(msg);
        return { status: "error", message };
      } finally {
        stopTick();
        abortRef.current = null;
      }
    },
    [stopTick]
  );

  return {
    draft,
    setDraft,
    phase,
    working: phase === "working",
    elapsedSec,
    notice,
    retryPrompt,
    run,
    cancel,
  };
}
