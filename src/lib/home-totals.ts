/**
 * The signed-in home replaces the old value cards, return split, and header
 * net worth with the snapshot header. Those widgets come back only when the
 * snapshot failed. Guests and the other pages keep them.
 */
export function duplicateHomeFiguresVisible(input: {
  isHome: boolean;
  preview: boolean;
  balancesReady: boolean;
  snapshotPresent: boolean;
}): boolean {
  if (!input.isHome || input.preview) return true;
  return input.balancesReady && !input.snapshotPresent;
}
