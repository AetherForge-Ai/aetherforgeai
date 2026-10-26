// b83 CR-6c: helpers for the Stripe webhook (bounded IO + user resolution).
import { parsePaymentLinkRef } from "@/lib/plans";

/** Totalum/Stripe calls must finish well inside Stripe's delivery window. */
export const WEBHOOK_IO_TIMEOUT_MS = 8000;

export function withTimeout<T>(p: Promise<T>, ms = WEBHOOK_IO_TIMEOUT_MS, label = "io"): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (t) clearTimeout(t);
  });
}

/** The user id may ride on the object, or (invoices) on parent/subscription_details metadata. */
export function userIdFromEventObject(obj: any): string | null {
  return (
    (obj?.metadata?.userId as string) ||
    (obj?.parent?.subscription_details?.metadata?.userId as string) ||
    (obj?.subscription_details?.metadata?.userId as string) ||
    parsePaymentLinkRef(obj?.client_reference_id ?? null).userId ||
    null
  );
}
