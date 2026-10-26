/**
 * Provider name for the legal and disclosure pages only:
 * Privacy, Trust, the AI Disclaimer, and Terms.
 * Other public copy says "AI" or "a third-party AI service".
 * No model number is stated here.
 */

export const AI_PROVIDER_NAME = "xAI (Grok)";

/** 30-day API wording, from https://docs.x.ai/developers/faq/security. Zero Data Retention is not stated. */
export const AI_PROVIDER_API_SENTENCE =
  "Plain-English notes are written by a third-party AI service, xAI (Grok), through its API. We do not send any special retention setting with our requests. xAI's published API policy says API requests and responses are stored encrypted for up to 30 days for auditing in case of suspected abuse or misuse, then deleted automatically, and are not used to train its models without permission (https://docs.x.ai/developers/faq/security).";

/** K-12: AI disclaimer section 3, what a request can include. Legal pages only. */
export const AI_DISCLAIMER_DATA_SENTENCE =
  "To write a note, we send the AI the information that feature needs. Depending on the feature, that can include your question, recent chat messages, market data, and figures from your paper book such as holdings, values and gains or losses. We never send your email address, name, account ID or card details. The Trust page lists exactly what each feature sends.";

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
