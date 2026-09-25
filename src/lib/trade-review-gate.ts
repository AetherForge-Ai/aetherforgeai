"use client";

import { useCallback, useRef, useState } from "react";
import { TRADE_REVIEW_ARM_MS, reviewClickIsArmed } from "@/lib/trade-confirm";

/**
 * One lock for Review and Confirm. Review holds it for 400ms so a second
 * click cannot submit, then releases it so Confirm can claim the same lock.
 */
export function useTradeReviewGate() {
  const submittingRef = useRef(false);
  const armedAtRef = useRef(0);
  const tokenRef = useRef(0);
  const [confirmReady, setConfirmReady] = useState(false);

  const beginReviewGuard = useCallback((): boolean => {
    return !submittingRef.current;
  }, []);

  const armReview = useCallback(() => {
    const token = ++tokenRef.current;
    submittingRef.current = true;
    armedAtRef.current = Date.now();
    setConfirmReady(false);
    window.setTimeout(() => {
      if (tokenRef.current !== token) return;
      submittingRef.current = false;
      setConfirmReady(true);
    }, TRADE_REVIEW_ARM_MS);
  }, []);

  const disarmReview = useCallback(() => {
    tokenRef.current += 1;
    armedAtRef.current = 0;
    submittingRef.current = false;
    setConfirmReady(false);
  }, []);

  /** True only after the arm window, and only once. Claims the in-flight lock. */
  const claimCommit = useCallback((): boolean => {
    if (submittingRef.current) return false;
    if (!reviewClickIsArmed(armedAtRef.current)) return false;
    submittingRef.current = true;
    return true;
  }, []);

  const releaseCommit = useCallback(() => {
    submittingRef.current = false;
  }, []);

  return {
    submittingRef,
    confirmReady,
    beginReviewGuard,
    armReview,
    disarmReview,
    claimCommit,
    releaseCommit,
  };
}
