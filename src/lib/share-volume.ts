/**
 * Session volume for a listed share. A print of a few dozen shares is not a
 * day total (that is how a name can show volume 40). Use a published average
 * when the session print is implausible. Never invent a figure.
 */
export function plausibleShareVolume(
  session: number | null | undefined,
  average?: number | null,
): number | null {
  const sessionOk = typeof session === "number" && Number.isFinite(session) && session >= 1000;
  if (sessionOk) return Math.round(session);
  const averageOk = typeof average === "number" && Number.isFinite(average) && average >= 1000;
  if (averageOk) return Math.round(average);
  return null;
}
