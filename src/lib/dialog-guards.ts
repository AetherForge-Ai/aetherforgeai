/**
 * Radix Dialog dismissal guards.
 *
 * Dialogs that embed a Popover / cmdk search (ticker pickers) or a native date
 * picker have a nasty UX bug: those dropdowns render in a PORTAL outside the
 * dialog's DOM subtree, so clicking a result — or a cmdk item unmounting on
 * select — is misread by Radix as an "outside" click and the whole dialog
 * dismisses itself. These helpers keep the dialog open in exactly those cases.
 *
 * Usage:
 *   <DialogContent
 *     onInteractOutside={keepDialogOpenOnPortalInteraction}
 *     onEscapeKeyDown={keepDialogOpenWhilePopoverOpen}
 *   >
 */

/** Selectors that identify a portaled popover / command dropdown. */
const PORTAL_SELECTORS = [
  "[data-radix-popper-content-wrapper]",
  "[data-slot='popover-content']",
  "[cmdk-root]",
  "[cmdk-list]",
] as const;

/**
 * Prevent the dialog from closing when the outside interaction actually lands on
 * a portaled popover/command element, or on a node that has already been removed
 * from the DOM (the classic "select a cmdk item → dialog closes" race).
 */
export function keepDialogOpenOnPortalInteraction(e: { target: EventTarget | null; preventDefault: () => void }) {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  const insidePortal = PORTAL_SELECTORS.some((sel) => t.closest?.(sel));
  if (insidePortal || !document.body.contains(t)) {
    e.preventDefault();
  }
}

/**
 * Swallow Escape while a popover search is open so it only collapses the popover
 * (leaving the parent dialog and the user's half-filled form intact).
 */
export function keepDialogOpenWhilePopoverOpen(e: { preventDefault: () => void }) {
  if (typeof document !== "undefined" && document.querySelector("[data-radix-popper-content-wrapper]")) {
    e.preventDefault();
  }
}
