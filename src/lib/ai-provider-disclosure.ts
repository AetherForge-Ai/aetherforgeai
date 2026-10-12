/**
 * Provider name for the legal and disclosure pages only:
 * Privacy, Trust, the AI Disclaimer, and Terms.
 * Other public copy says "AI" or "a third-party AI service".
 * No model number is stated here.
 */

export const AI_PROVIDER_NAME = "xAI (Grok)";

/** 30-day API wording. Zero Data Retention is not stated. */
export const AI_PROVIDER_API_SENTENCE =
  "The third-party AI service in those sentences is xAI (Grok), used through its API. xAI's API terms state that API requests and responses are kept for up to 30 days for abuse monitoring, then deleted, and are not used to train its models.";

export function nameAiProvider<T extends { name: string; role: string }>(
  rows: readonly T[],
  options?: { usa?: boolean }
): T[] {
  return rows.map((row) => {
    if (row.name !== "A third-party AI service") return row;
    const role = options?.usa ? `${row.role} (USA)` : row.role;
    return { ...row, name: AI_PROVIDER_NAME, role };
  });
}
