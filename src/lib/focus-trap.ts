/**
 * b65 G-14 (GOAL-LOCK #49): pure focus-trap logic for the Add panel (record-transaction dialog) and other
 * non-modal dialogs. Tab from the last field wraps to the first; Shift+Tab from the first wraps to the last;
 * focus outside the panel comes back to the first (or last, going backwards) field.
 */
export const TABBABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The element to focus instead of the browser default, or null to let the browser move focus. */
export function trapTabTarget<T>(items: readonly T[], active: T | null, backwards: boolean, activeInside: boolean): T | null {
  if (!items.length) return null;
  const first = items[0];
  const last = items[items.length - 1];
  if (!activeInside || active == null) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}

/** Where stray focus that left the panel should go: the field after (or before) the last one focused inside. */
export function recoverFocusTarget<T>(items: readonly T[], lastInside: T | null, backwards: boolean): T | null {
  if (!items.length) return null;
  const at = lastInside == null ? -1 : items.indexOf(lastInside);
  if (at === -1) return backwards ? items[items.length - 1] : items[0];
  return items[(at + (backwards ? -1 : 1) + items.length) % items.length];
}

/** Scrollable table wrappers: keyboard-focusable named regions (axe scrollable-region-focusable). */
export function scrollRegionProps(label: string) {
  return { tabIndex: 0, role: "region" as const, "aria-label": `${label} (scrolls sideways)` };
}
