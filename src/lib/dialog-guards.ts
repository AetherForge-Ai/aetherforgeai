/**
 * Radix Dialog dismissal guards.
 *
 * Dialogs that embed a Popover / cmdk search (ticker pickers) or a native date
 * picker have a nasty UX bug: those dropdowns render in a PORTAL outside the
 * dialog's DOM subtree, so clicking a result — or a cmdk item unmounting on
 * select — is misread by Radix as an "outside" click and the whole dialog
 * dismisses itself. Async search completion (loading → results swap) can also
 * fire a spurious onOpenChange(false). These helpers keep the dialog open in
 * exactly those cases.
 *
 * Usage:
 *   <DialogContent
 *     onInteractOutside={keepDialogOpenOnPortalInteraction}
 *     onPointerDownOutside={keepDialogOpenOnPortalInteraction}
 *     onFocusOutside={keepDialogOpenOnPortalInteraction}
 *     onEscapeKeyDown={keepDialogOpenWhilePopoverOpen}
 *   >
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

/**
 * Prevent the dialog from closing when the outside interaction actually lands on
 * a portaled popover/command element, or on a node that has already been removed
 * from the DOM (the classic "select a cmdk item → dialog closes" race).
 * Wire to onInteractOutside, onPointerDownOutside and onFocusOutside.
 */
export function keepDialogOpenOnPortalInteraction(e: {
  target: EventTarget | null;
  preventDefault: () => void;
}) {
  const t = e.target as HTMLElement | null;
  if (isPortalTarget(t) || isGuardFlag("afDialogSearchGuard") || isGuardFlag("afDialogSelectGuard")) {
    e.preventDefault();
  }
}

/**
 * Swallow Escape while a popover search is open so it only collapses the popover
 * (leaving the parent dialog and the user's half-filled form intact).
 */
export function keepDialogOpenWhilePopoverOpen(e: { preventDefault: () => void }) {
  if (
    typeof document !== "undefined" &&
    (document.querySelector("[data-radix-popper-content-wrapper]") ||
      document.querySelector("[cmdk-root]") ||
      isGuardFlag("afDialogSearchGuard"))
  ) {
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
  opts?: { graceMs?: number }
) {
  if (next) {
    onOpenChange(true);
    return;
  }
  if (typeof document === "undefined") {
    onOpenChange(false);
    return;
  }
  const popoverOpen =
    !!document.querySelector("[data-radix-popper-content-wrapper]") ||
    !!document.querySelector("[cmdk-root]") ||
    !!document.querySelector("[data-slot='popover-content']");
  if (popoverOpen) return;

  void opts;
  if (isGuardFlag("afDialogSearchGuard") || isGuardFlag("afDialogSelectGuard")) return;

  onOpenChange(false);
}

/** Call from ticker/coin pick handlers so the parent dialog survives the select race. */
export function markDialogSelectGuard(ms = 450) {
  if (typeof document === "undefined") return;
  const body = document.body as HTMLElement & { dataset: DOMStringMap };
  body.dataset.afDialogSelectGuard = "1";
  window.setTimeout(() => {
    delete body.dataset.afDialogSelectGuard;
  }, ms);
}

/**
 * Keep the parent Dialog open for the full ticker/coin search lifecycle
 * (debounce → fetch → results/error). Call when search starts; pass a short
 * grace when it settles so async completion cannot dismiss the dialog.
 */
let searchGuardTimer: number | null = null;
export function markDialogSearchGuard(ms = 8000) {
  if (typeof document === "undefined") return;
  const body = document.body as HTMLElement & { dataset: DOMStringMap };
  body.dataset.afDialogSearchGuard = "1";
  if (searchGuardTimer != null) window.clearTimeout(searchGuardTimer);
  searchGuardTimer = window.setTimeout(() => {
    delete body.dataset.afDialogSearchGuard;
    searchGuardTimer = null;
  }, ms);
}

export function clearDialogSearchGuard(graceMs = 750) {
  if (typeof document === "undefined") return;
  if (searchGuardTimer != null) window.clearTimeout(searchGuardTimer);
  const body = document.body as HTMLElement & { dataset: DOMStringMap };
  body.dataset.afDialogSearchGuard = "1";
  searchGuardTimer = window.setTimeout(() => {
    delete body.dataset.afDialogSearchGuard;
    searchGuardTimer = null;
  }, graceMs);
}
