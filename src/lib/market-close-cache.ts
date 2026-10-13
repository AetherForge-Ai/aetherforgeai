/**
 * One market close per Auckland civil day.
 * Later loads on that day reuse the first snapshot instead of a new Yahoo print.
 */

import { aucklandCivilToday } from "@/lib/nz-tax-year";

export function snapshotCloseKey(now: Date = new Date()): string {
  return aucklandCivilToday(now);
}
