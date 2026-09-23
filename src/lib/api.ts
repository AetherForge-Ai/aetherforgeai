"use client";

/**
 * Typed client-side fetch service.
 *
 * All client components MUST use these helpers instead of raw `fetch()`
 * so every call/response follows the same `{ ok, data?, error? }` shape.
 */

import { getActiveAccountUserId } from "@/lib/account-identity";

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  /** Session user echoed by account-scoped routes. Required before applying. */
  userId?: string;
  total?: number;
  error?: any;
  status?: number;
  /** True when the request was aborted because the active account changed. */
  aborted?: boolean;
}

export interface ApiInit {
  signal?: AbortSignal;
}

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const headers = new Headers(options?.headers);
    const uid = getActiveAccountUserId();
    // Tell the server which account the UI is showing. A mismatch (stale
    // session cookie / prior-account in-flight) must not return that ledger.
    if (uid && !headers.has("x-af-user-id")) headers.set("x-af-user-id", uid);
    // Always credentials + no-store: authenticated GETs must never reuse another
    // tab/session's cached ledger/cash (Buy/Add account-switch bug).
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as ApiResponse<T>;
    if (json && typeof json === "object") json.status = res.status;
    return json;
  } catch (err) {
    if (options?.signal?.aborted) {
      return { ok: false, error: "aborted", aborted: true };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const api = {
  get<T>(url: string, init?: ApiInit): Promise<ApiResponse<T>> {
    return request<T>(url, { signal: init?.signal });
  },

  post<T>(url: string, body: unknown, init?: ApiInit): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: init?.signal,
    });
  },

  put<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  delete<T>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url, { method: "DELETE" });
  },
};
