/**
 * Monday projections email for a paid plan.
 * Sending is off unless WEEKLY_EMAIL_SEND is exactly "on".
 * Nothing in this file contacts a mailbox or an AI service.
 * The same market-wide board is mailed to each recipient. No account book is read.
 *
 * pull-check:weekly-email-2026-10-11
 */

import { aucklandClock } from "@/lib/product-note";
import { isFreeReportPlan, normalizePlanKey } from "@/lib/entitlements";
import { CUSTOMER_EMAIL } from "@/lib/public-copy";
import type { OutboundMail } from "@/lib/transactional-mail";
import {
  scrubWeeklyAiNote,
  weeklyEmailPrompt,
  type WeeklyEmailBoard,
  type WeeklyEmailRenderInput,
} from "@/lib/weekly-email-copy";

export const WEEKLY_EMAIL_FROM = CUSTOMER_EMAIL;
export const WEEKLY_EMAIL_FROM_NAME = "AetherForge AI";
/** Opt-out and last ISO week. Not a holding. */
export const WEEKLY_EMAIL_LEDGER_TICKER = "AF-WEM";
/** Shared AI note for the ISO week. Not a holding. */
export const WEEKLY_EMAIL_NOTE_TICKER = "AF-WEN";

/** One cron tick sends at most this many messages. */
export const WEEKLY_EMAIL_SEND_LIMIT = 20;
/** Active accounts read in one tick. Already-sent rows are skipped. */
export const WEEKLY_EMAIL_SCAN_LIMIT = 400;
/** Stop the tick after this long so a worker can exit. */
export const WEEKLY_EMAIL_RUNTIME_MS = 20_000;

/**
 * Monday morning in Pacific/Auckland, 07:00 through 08:59.
 * A single 07:00 call finishes one bounded batch. Later calls in this window
 * finish the rest. Idempotency stops a second copy in the same ISO week.
 */
export const WEEKLY_EMAIL_START_MINUTE = 7 * 60;
export const WEEKLY_EMAIL_END_MINUTE = 9 * 60;

const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Published short-context rates in USD per 1,000,000 tokens.
 * Checked 29 Sep 2026 for the completion the report service already calls.
 * This note uses a smaller cap than a full report.
 */
export const WEEKLY_EMAIL_USD_PER_MILLION_INPUT = 2;
export const WEEKLY_EMAIL_USD_PER_MILLION_OUTPUT = 6;
export const WEEKLY_EMAIL_INPUT_TOKEN_CAP = 1500;
export const WEEKLY_EMAIL_OUTPUT_TOKEN_CAP = 450;

/** Paid plans already recognised on the account. Free and unsigned are excluded. */
const PAID_PLAN_KEYS = new Set([
  "weekly",
  "monthly",
  "yearly",
  "dual_yearly",
  "starter_monthly",
  "starter_yearly",
  "pro_monthly",
  "pro_yearly",
  "ultimate_monthly",
  "ultimate_yearly",
]);

export interface WeeklyEmailCandidate {
  id: string;
  email: string;
  emailVerified: unknown;
  name?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
}

export interface WeeklyEmailPreference {
  optedOut: boolean;
  lastIsoWeek: string | null;
}

export type PreferenceRead =
  | { ok: true; preference: WeeklyEmailPreference }
  | { ok: false; reason: "unreadable" };

export interface WeeklyEmailStore {
  read(userId: string): Promise<PreferenceRead>;
  write(userId: string, preference: WeeklyEmailPreference): Promise<void>;
}

export type WeeklyEmailSkip =
  | "no-email"
  | "unverified"
  | "not-paid"
  | "expired"
  | "opted-out"
  | "already-sent"
  | "preference-unreadable";

export interface WeeklyEmailNoteStore {
  read(isoWeek: string): Promise<string | null>;
  write(isoWeek: string, note: string): Promise<void>;
}

export function encodeWeeklyEmailNote(isoWeek: string, note: string): string {
  return `v1|${isoWeek}|${note.replace(/\s+/g, " ").trim()}`;
}

/** A note saved for a different week is ignored. */
export function decodeWeeklyEmailNote(raw: string | null | undefined, isoWeek: string): string | null {
  if (!raw?.trim()) return null;
  const match = /^v1\|(\d{4}-W\d{2})\|([\s\S]+)$/.exec(raw.trim());
  if (!match || match[1] !== isoWeek) return null;
  const note = match[2].trim();
  return note || null;
}

export function createMemoryWeeklyEmailNoteStore(
  seed: Record<string, string> = {},
): WeeklyEmailNoteStore & { raw: Record<string, string> } {
  const raw = { ...seed };
  return {
    raw,
    async read(isoWeek) {
      return decodeWeeklyEmailNote(raw[isoWeek], isoWeek);
    },
    async write(isoWeek, note) {
      raw[isoWeek] = encodeWeeklyEmailNote(isoWeek, note);
    },
  };
}

export function weeklyEmailSendingEnabled(env?: { WEEKLY_EMAIL_SEND?: string | null }): boolean {
  return env?.WEEKLY_EMAIL_SEND === "on";
}

export function weeklyEmailUnsubscribeSecret(env?: {
  WEEKLY_EMAIL_UNSUBSCRIBE_SECRET?: string | null;
  CRON_SECRET?: string | null;
}): string | null {
  const dedicated = env?.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (dedicated) return dedicated;
  const cron = env?.CRON_SECRET?.trim();
  return cron || null;
}

export function presentedCronSecret(
  url: string,
  headers: { get(name: string): string | null },
): string | null {
  const query = new URL(url).searchParams.get("key") || new URL(url).searchParams.get("secret");
  if (query) return query;
  const header = headers.get("x-cron-secret");
  if (header) return header;
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/** True when Totalum's numeric flag, or a boolean, says the address was verified. */
export function emailIsVerified(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
}

export function paidWeeklyEmailPlan(plan?: string | null): boolean {
  const key = normalizePlanKey(plan);
  if (!key || isFreeReportPlan(key)) return false;
  return PAID_PLAN_KEYS.has(key);
}

export function weeklyEmailWindow(now: Date): { open: boolean; isoWeek: string } {
  const clock = aucklandClock(now);
  const minutes = clock.hour * 60 + clock.minute;
  const open =
    clock.weekday === "Mon" && minutes >= WEEKLY_EMAIL_START_MINUTE && minutes < WEEKLY_EMAIL_END_MINUTE;
  return { open, isoWeek: isoWeekFromAuckland(clock.year, clock.month, clock.day) };
}

/** ISO week of the Auckland civil date, such as 2026-W42. */
export function isoWeekFromAuckland(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const start = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function selectWeeklyEmailRecipient(
  user: WeeklyEmailCandidate,
  now: Date,
): { ok: true } | { ok: false; reason: WeeklyEmailSkip } {
  if (!user.email.trim()) return { ok: false, reason: "no-email" };
  if (!emailIsVerified(user.emailVerified)) return { ok: false, reason: "unverified" };
  if (user.subscriptionStatus !== "active" || !paidWeeklyEmailPlan(user.subscriptionPlan)) {
    return { ok: false, reason: "not-paid" };
  }
  if (user.subscriptionExpiresAt) {
    const exp = new Date(user.subscriptionExpiresAt).getTime();
    if (Number.isFinite(exp) && exp < now.getTime()) return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function encodeWeeklyEmailPreference(preference: WeeklyEmailPreference): string {
  const week =
    preference.lastIsoWeek && /^\d{4}-W\d{2}$/.test(preference.lastIsoWeek) ? preference.lastIsoWeek : "";
  return `v1|${preference.optedOut ? "off" : "on"}|${week}`;
}

/** Empty means opted in and not yet sent. A broken marker is unreadable. */
export function decodeWeeklyEmailPreference(raw: string | null | undefined): WeeklyEmailPreference | null {
  if (raw == null || raw.trim() === "") return { optedOut: false, lastIsoWeek: null };
  const match = /^v1\|(on|off)\|(\d{4}-W\d{2})?$/.exec(raw.trim());
  if (!match) return null;
  return { optedOut: match[1] === "off", lastIsoWeek: match[2] || null };
}

export function createMemoryWeeklyEmailStore(
  seed: Record<string, string> = {},
): WeeklyEmailStore & { raw: Record<string, string> } {
  const raw = { ...seed };
  return {
    raw,
    async read(userId) {
      if (!(userId in raw)) return { ok: true, preference: { optedOut: false, lastIsoWeek: null } };
      const preference = decodeWeeklyEmailPreference(raw[userId]);
      if (!preference) return { ok: false, reason: "unreadable" };
      return { ok: true, preference };
    },
    async write(userId, preference) {
      raw[userId] = encodeWeeklyEmailPreference(preference);
    },
  };
}

export async function applyWeeklyEmailOptOut(store: WeeklyEmailStore, userId: string): Promise<void> {
  const current = await store.read(userId);
  const lastIsoWeek = current.ok ? current.preference.lastIsoWeek : null;
  await store.write(userId, { optedOut: true, lastIsoWeek });
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToString(value: string): string {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(sig));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function signWeeklyEmailToken(
  userId: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const id = userId.trim();
  if (!id || !secret) throw new Error("Weekly email token is missing an id or a secret.");
  const payload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ u: id, e: now + TOKEN_TTL_MS })),
  );
  const sig = await hmacSha256(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyWeeklyEmailToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<string | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || token.split(".").length !== 2 || !secret) return null;
  const expected = await hmacSha256(secret, payload);
  if (!safeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(base64UrlToString(payload)) as { u?: unknown; e?: unknown };
    if (typeof parsed.u !== "string" || !parsed.u.trim()) return null;
    if (typeof parsed.e !== "number" || !Number.isFinite(parsed.e) || parsed.e < now) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

export function estimateWeeklyEmailTokens(inputChars: number, outputTokens: number): {
  inputTokens: number;
  outputTokens: number;
} {
  const inputTokens = Math.min(
    WEEKLY_EMAIL_INPUT_TOKEN_CAP,
    Math.max(0, Math.ceil(inputChars / 4)),
  );
  return {
    inputTokens,
    outputTokens: Math.min(WEEKLY_EMAIL_OUTPUT_TOKEN_CAP, Math.max(0, Math.floor(outputTokens))),
  };
}

/** USD and NZD for one completion. NZD uses the supplied book rate (1 USD → NZD). */
export function estimateWeeklyEmailCost(
  inputChars: number,
  outputTokens: number,
  nzdPerUsd = 1.67,
): { inputTokens: number; outputTokens: number; usd: number; nzd: number } {
  const tokens = estimateWeeklyEmailTokens(inputChars, outputTokens);
  const usd =
    (tokens.inputTokens / 1_000_000) * WEEKLY_EMAIL_USD_PER_MILLION_INPUT +
    (tokens.outputTokens / 1_000_000) * WEEKLY_EMAIL_USD_PER_MILLION_OUTPUT;
  const rate = nzdPerUsd > 0 && Number.isFinite(nzdPerUsd) ? nzdPerUsd : 1.67;
  return { ...tokens, usd, nzd: usd * rate };
}

export function weeklyEmailCostCeiling(nzdPerUsd = 1.67): { usd: number; nzd: number } {
  return estimateWeeklyEmailCost(
    WEEKLY_EMAIL_INPUT_TOKEN_CAP * 4,
    WEEKLY_EMAIL_OUTPUT_TOKEN_CAP,
    nzdPerUsd,
  );
}

export interface WeeklyEmailJobResult {
  status: number;
  body: {
    ok: boolean;
    sent: number;
    sender: "off" | "on";
    reason: string;
    isoWeek: string | null;
    scanned: number;
    deferred: number;
    skipped: Partial<Record<WeeklyEmailSkip, number>>;
    failed: number;
  };
}

function bump(skipped: Partial<Record<WeeklyEmailSkip, number>>, reason: WeeklyEmailSkip) {
  skipped[reason] = (skipped[reason] || 0) + 1;
}

/**
 * One Monday tick. `send` is injected so tests never touch a mailbox.
 * The week is claimed before send so a retry does not post a second copy.
 * Projections are loaded once. The AI note is loaded or written once for the ISO week.
 */
export async function runWeeklyEmailJob(args: {
  now: Date;
  env?: { WEEKLY_EMAIL_SEND?: string | null; WEEKLY_EMAIL_UNSUBSCRIBE_SECRET?: string | null; CRON_SECRET?: string | null };
  users: WeeklyEmailCandidate[];
  store: WeeklyEmailStore;
  loadBoard: () => Promise<WeeklyEmailBoard | null>;
  noteStore?: WeeklyEmailNoteStore;
  render: (input: WeeklyEmailRenderInput) => Promise<OutboundMail> | OutboundMail;
  complete?: (prompt: string) => Promise<string | null>;
  send: (mail: OutboundMail) => Promise<void>;
  unsubscribeUrl: (userId: string) => Promise<string>;
}): Promise<WeeklyEmailJobResult["body"]> {
  const window = weeklyEmailWindow(args.now);
  const secret = weeklyEmailUnsubscribeSecret(args.env);
  if (!secret) {
    return {
      ok: true,
      sent: 0,
      sender: "off",
      reason: "unsubscribe-not-configured",
      isoWeek: window.isoWeek,
      scanned: 0,
      deferred: 0,
      skipped: {},
      failed: 0,
    };
  }
  if (!weeklyEmailSendingEnabled(args.env)) {
    return {
      ok: true,
      sent: 0,
      sender: "off",
      reason: "sender-off",
      isoWeek: window.isoWeek,
      scanned: 0,
      deferred: 0,
      skipped: {},
      failed: 0,
    };
  }
  if (!window.open) {
    return {
      ok: true,
      sent: 0,
      sender: "on",
      reason: "outside-window",
      isoWeek: window.isoWeek,
      scanned: 0,
      deferred: 0,
      skipped: {},
      failed: 0,
    };
  }

  let board: WeeklyEmailBoard | null = null;
  try {
    board = await args.loadBoard();
  } catch {
    console.error("[weekly-email] projections unavailable");
    board = null;
  }
  if (!board || board.projections.length === 0) {
    console.log("[weekly-email] no verified projections. No email sent.");
    return {
      ok: true,
      sent: 0,
      sender: "on",
      reason: "no-projections",
      isoWeek: window.isoWeek,
      scanned: 0,
      deferred: 0,
      skipped: {},
      failed: 0,
    };
  }

  const deadline = Date.now() + WEEKLY_EMAIL_RUNTIME_MS;
  const skipped: Partial<Record<WeeklyEmailSkip, number>> = {};
  let sent = 0;
  let failed = 0;
  let index = 0;
  let aiNote: string | null | undefined;
  const users = args.users.slice(0, WEEKLY_EMAIL_SCAN_LIMIT);

  for (; index < users.length; index++) {
    if (Date.now() >= deadline || sent >= WEEKLY_EMAIL_SEND_LIMIT) break;
    const user = users[index];
    try {
      const gate = selectWeeklyEmailRecipient(user, args.now);
      if (gate.ok === false) {
        bump(skipped, gate.reason);
        continue;
      }
      const pref = await args.store.read(user.id);
      if (!pref.ok) {
        bump(skipped, "preference-unreadable");
        continue;
      }
      if (pref.preference.optedOut) {
        bump(skipped, "opted-out");
        continue;
      }
      if (pref.preference.lastIsoWeek === window.isoWeek) {
        bump(skipped, "already-sent");
        continue;
      }
      if (aiNote === undefined) {
        aiNote = await weeklyEmailNoteForWeek(window.isoWeek, board, args.noteStore, args.complete);
      }
      const mail = await args.render({
        to: user.email.trim(),
        board,
        aiNote,
        unsubscribeUrl: await args.unsubscribeUrl(user.id),
      });
      await args.store.write(user.id, { optedOut: false, lastIsoWeek: window.isoWeek });
      await args.send(mail);
      sent += 1;
      console.log(`[weekly-email] sent user=${user.id} ai=${aiNote ? "yes" : "no"}`);
    } catch {
      failed += 1;
      console.error(`[weekly-email] user=${user.id} failed`);
    }
  }

  return {
    ok: true,
    sent,
    sender: "on",
    reason: "done",
    isoWeek: window.isoWeek,
    scanned: index,
    deferred: users.length - index,
    skipped,
    failed,
  };
}

async function weeklyEmailNoteForWeek(
  isoWeek: string,
  board: WeeklyEmailBoard,
  noteStore: WeeklyEmailNoteStore | undefined,
  complete: ((prompt: string) => Promise<string | null>) | undefined,
): Promise<string | null> {
  if (noteStore) {
    try {
      const saved = scrubWeeklyAiNote(await noteStore.read(isoWeek));
      if (saved) return saved;
    } catch {
      console.error("[weekly-email] week note unreadable");
    }
  }
  if (!complete) return null;
  try {
    const note = scrubWeeklyAiNote(await complete(weeklyEmailPrompt(board)));
    if (note && noteStore) {
      try {
        await noteStore.write(isoWeek, note);
      } catch {
        console.error("[weekly-email] week note not stored");
      }
    }
    return note;
  } catch {
    console.error("[weekly-email] ai failed");
    return null;
  }
}

export async function handleWeeklyEmailCron(args: {
  url: string;
  headers: { get(name: string): string | null };
  env: { CRON_SECRET?: string | null; WEEKLY_EMAIL_SEND?: string | null; WEEKLY_EMAIL_UNSUBSCRIBE_SECRET?: string | null };
  now: Date;
  users: WeeklyEmailCandidate[];
  store: WeeklyEmailStore;
  loadBoard: () => Promise<WeeklyEmailBoard | null>;
  noteStore?: WeeklyEmailNoteStore;
  render: (input: WeeklyEmailRenderInput) => Promise<OutboundMail> | OutboundMail;
  complete?: (prompt: string) => Promise<string | null>;
  send: (mail: OutboundMail) => Promise<void>;
  unsubscribeUrl: (userId: string) => Promise<string>;
}): Promise<WeeklyEmailJobResult> {
  if (!args.env.CRON_SECRET) {
    return {
      status: 503,
      body: {
        ok: false,
        sent: 0,
        sender: "off",
        reason: "cron-not-configured",
        isoWeek: null,
        scanned: 0,
        deferred: 0,
        skipped: {},
        failed: 0,
      },
    };
  }
  if (presentedCronSecret(args.url, args.headers) !== args.env.CRON_SECRET) {
    return {
      status: 401,
      body: {
        ok: false,
        sent: 0,
        sender: "off",
        reason: "unauthorized",
        isoWeek: null,
        scanned: 0,
        deferred: 0,
        skipped: {},
        failed: 0,
      },
    };
  }
  try {
    const body = await runWeeklyEmailJob(args);
    return { status: 200, body };
  } catch {
    return {
      status: 500,
      body: {
        ok: false,
        sent: 0,
        sender: weeklyEmailSendingEnabled(args.env) ? "on" : "off",
        reason: "failed",
        isoWeek: null,
        scanned: 0,
        deferred: 0,
        skipped: {},
        failed: 0,
      },
    };
  }
}
