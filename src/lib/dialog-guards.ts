/**
 * Radix Dialog dismissal guards.
 *
 * Dialogs that embed a Popover / cmdk search (ticker pickers) or a native date
 * picker have a nasty UX bug: those dropdowns render in a PORTAL outside the
 * dialog's DOM subtree, so clicking a result — or a cmdk item unmounting on
 * select — is misread by Radix as an "outside" click and the whole dialog
 * dismisses itself. Async search completion (loading → results swap) can also
 * fire a spurious onOpenChange(false). On holdings accounts, live-price hydrate
 * / soft-refresh re-renders the dashboard mid-search and the same race shows up
 * as "Searching markets…" → Buy/Add vanishes. These helpers keep the dialog open
 * in exactly those cases.
 *
 * Round 6: module-level searchActiveUntil (DOM/body.dataset can race on remount),
 * shouldAllowDialogClose() reason gate, and DEBUG_TC_DIALOG logging.
 */

/** Selectors that identify a portaled popover / command dropdown. */
const PORTAL_SELECTORS = [
  "[data-radix-popper-content-wrapper]",
  "[data-slot='popover-content']",
  "[data-radix-select-content]",
  "[cmdk-root]",
  "[cmdk-list]",
  "[cmdk-item]",
] as const;

/** Module-level guard — survives body.dataset wipes and TickerSearch remount races. */
let searchGuardUntil = 0;
let selectGuardUntil = 0;
let searchGuardTimer: number | null = null;
let selectGuardTimer: number | null = null;
/**
 * Typed ticker query, independent of TransactionDialog React state.
 * A stocks-hub remount wipes `searchQuery` back to "" just as Yahoo settles,
 * and the close gate then treats the dismiss as idle. This survives that.
 */
let searchQueryText = "";

/** Record the live TickerSearch / CryptoSearch query ("" clears it). */
export function noteDialogSearchQuery(query: string): void {
  searchQueryText = (query ?? "").trim();
}

export function dialogSearchQueryLength(): number {
  return searchQueryText.length;
}

export type DialogCloseReason =
  | "escape"
  | "explicit"
  | "interact-outside"
  | "focus-outside"
  | "pointer-outside"
  | "unknown";

function isPortalTarget(t: HTMLElement | null): boolean {
  if (!t) return true; // detached / null target — classic cmdk select race
  if (PORTAL_SELECTORS.some((sel) => t.closest?.(sel))) return true;
  // Node already removed from the document (select → unmount race).
  if (typeof document !== "undefined" && !document.body.contains(t)) return true;
  return false;
}

function bodyDataset(): DOMStringMap | null {
  if (typeof document === "undefined") return null;
  return (document.body as HTMLElement & { dataset: DOMStringMap }).dataset;
}

function isGuardFlag(key: "afDialogSelectGuard" | "afDialogSearchGuard"): boolean {
  const ds = bodyDataset();
  return ds?.[key] === "1";
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** True while a ticker/coin search popover is mounted or a search guard is armed. */
export function isDialogSearchActive(): boolean {
  const t = nowMs();
  if (t < searchGuardUntil || t < selectGuardUntil) return true;
  if (typeof document === "undefined") return false;
  if (isGuardFlag("afDialogSearchGuard") || isGuardFlag("afDialogSelectGuard")) return true;
  return !!(
    document.querySelector("[data-radix-popper-content-wrapper]") ||
    document.querySelector("[cmdk-root]") ||
    document.querySelector("[data-slot='popover-content']") ||
    document.querySelector("[data-af-ticker-search-panel]")
  );
}

/**
 * Pure close-gate used by Transaction Centre / StockDialog and unit-tested.
 * While search is active (or the user has typed a query), only an explicit
 * Close/Cancel/success may dismiss — never interact-outside / focus-outside.
 * Escape is allowed only when search is NOT active (popover already collapsed).
 */
export function shouldAllowDialogClose(opts: {
  searchActive: boolean;
  queryLength?: number;
  reason: DialogCloseReason;
}): boolean {
  const typed = (opts.queryLength ?? 0) > 0;
  if (opts.reason === "explicit") return true;
  if (opts.searchActive || typed) {
    // Escape while the popover/query is live must NOT kill the parent dialog —
    // TickerSearch owns Escape to collapse the panel first.
    return false;
  }
  // No active search: allow Escape / unknown (Radix X) / outside.
  return true;
}

/** Gated debug logger — enable with localStorage.DEBUG_TC_DIALOG = "1". */
export function debugTcDialog(message: string, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("DEBUG_TC_DIALOG") !== "1") return;
  } catch {
    return;
  }
  const stack = new Error().stack?.split("\n").slice(2, 8).join("\n") ?? "";
  // eslint-disable-next-line no-console
  console.debug("[TC-DIALOG]", message, { ...detail, stack });
}

/**
 * Prevent the dialog from closing when the outside interaction actually lands on
 * a portaled popover/command element, or on a node that has already been removed
 * from the DOM (the classic "select a cmdk item → dialog closes" race).
 * Also swallows ALL outside interactions while a search is in flight / popover
 * is open — holdings soft-refresh can orphan event targets mid-search.
 * Wire to onInteractOutside, onPointerDownOutside and onFocusOutside.
 */
export function keepDialogOpenOnPortalInteraction(e: {
  target: EventTarget | null;
  preventDefault: () => void;
}) {
  const t = e.target as HTMLElement | null;
  if (
    isPortalTarget(t) ||
    isGuardFlag("afDialogSearchGuard") ||
    isGuardFlag("afDialogSelectGuard") ||
    isDialogSearchActive()
  ) {
    e.preventDefault();
  }
}

/**
 * Swallow Escape while a popover search is open so it only collapses the popover
 * (leaving the parent dialog and the user's half-filled form intact).
 */
export function keepDialogOpenWhilePopoverOpen(e: { preventDefault: () => void }) {
  if (isDialogSearchActive()) {
    e.preventDefault();
  }
}

/**
 * Wrap Dialog `onOpenChange` so a close request is ignored while a portaled
 * ticker/coin search popover is still open, a search is in flight, or a select
 * just happened. MarketsExplorer avoids this by selecting the ticker before
 * opening Buy; Transaction Center embeds the search inside the dialog and needs
 * this guard.
 */
export function guardDialogOpenChange(
  next: boolean,
  onOpenChange: (open: boolean) => void,
  opts?: { graceMs?: number; reason?: DialogCloseReason; queryLength?: number }
) {
  const reason: DialogCloseReason = opts?.reason ?? "unknown";
  // Module query covers the stocks-page remount that resets React searchQuery
  // to 0 in the same turn Yahoo replaces "Searching markets…".
  const queryLength = Math.max(opts?.queryLength ?? 0, dialogSearchQueryLength());
  debugTcDialog("onOpenChange", {
    next,
    reason,
    searchActive: isDialogSearchActive(),
    queryLength,
    searchGuardUntil,
    selectGuardUntil,
  });
  if (next) {
    onOpenChange(true);
    return;
  }
  void opts?.graceMs;
  const allowed = shouldAllowDialogClose({
    searchActive: isDialogSearchActive(),
    queryLength,
    reason,
  });
  if (!allowed) {
    debugTcDialog("blocked close", { reason, queryLength });
    return;
  }
  noteDialogSearchQuery("");
  onOpenChange(false);
}

/** Call from ticker/coin pick handlers so the parent dialog survives the select race. */
export function markDialogSelectGuard(ms = 450) {
  const until = nowMs() + ms;
  if (until > selectGuardUntil) selectGuardUntil = until;
  if (typeof document === "undefined") return;
  const body = document.body as HTMLElement & { dataset: DOMStringMap };
  body.dataset.afDialogSelectGuard = "1";
  if (selectGuardTimer != null) window.clearTimeout(selectGuardTimer);
  selectGuardTimer = window.setTimeout(() => {
    delete body.dataset.afDialogSelectGuard;
    selectGuardTimer = null;
    if (nowMs() >= selectGuardUntil) selectGuardUntil = 0;
  }, ms);
}

/**
 * Keep the parent Dialog open for the full ticker/coin search lifecycle
 * (popover open → debounce → fetch → results/error → popover close).
 * Call when the popover opens or search starts; prefer clearDialogSearchGuard
 * only when the popover fully closes (not on every fetch settle — that left a
 * race on holdings soft-refresh after "Searching markets…").
 */
export function markDialogSearchGuard(ms = 30_000) {
  const until = nowMs() + ms;
  if (until > searchGuardUntil) searchGuardUntil = until;
  if (typeof document === "undefined") return;
  const body = document.body as HTMLElement & { dataset: DOMStringMap };
  body.dataset.afDialogSearchGuard = "1";
  if (searchGuardTimer != null) window.clearTimeout(searchGuardTimer);
  searchGuardTimer = window.setTimeout(() => {
    delete body.dataset.afDialogSearchGuard;
    searchGuardTimer = null;
    if (nowMs() >= searchGuardUntil) searchGuardUntil = 0;
  }, ms);
}

export function clearDialogSearchGuard(graceMs = 750) {
  const until = nowMs() + graceMs;
  // Never shorten an existing longer guard (remount races used to drop to 400ms).
  if (until > searchGuardUntil) searchGuardUntil = until;
  if (typeof document === "undefined") return;
  if (searchGuardTimer != null) window.clearTimeout(searchGuardTimer);
  const body = document.body as HTMLElement & { dataset: DOMStringMap };
  body.dataset.afDialogSearchGuard = "1";
  searchGuardTimer = window.setTimeout(() => {
    delete body.dataset.afDialogSearchGuard;
    searchGuardTimer = null;
    if (nowMs() >= searchGuardUntil) searchGuardUntil = 0;
  }, graceMs);
}

/** Drop the search guard immediately (popover closed, no grace needed). */
export function releaseDialogSearchGuard() {
  searchGuardUntil = 0;
  if (typeof document === "undefined") return;
  if (searchGuardTimer != null) {
    window.clearTimeout(searchGuardTimer);
    searchGuardTimer = null;
  }
  const body = document.body as HTMLElement & { dataset: DOMStringMap };
  delete body.dataset.afDialogSearchGuard;
}

/** Test helper — reset module timers between unit tests. */
export function __resetDialogGuardsForTests() {
  searchGuardUntil = 0;
  selectGuardUntil = 0;
  searchQueryText = "";
  if (typeof window !== "undefined") {
    if (searchGuardTimer != null) window.clearTimeout(searchGuardTimer);
    if (selectGuardTimer != null) window.clearTimeout(selectGuardTimer);
  }
  searchGuardTimer = null;
  selectGuardTimer = null;
}
