/** Score bands for projection copy. The word "strong" is only for 67 and above. */
export function scoreBand(score: number): "weak" | "moderate" | "strong" {
  if (score >= 67) return "strong";
  if (score >= 34) return "moderate";
  return "weak";
}

export function scoreBandSentence(score: number): string {
  const band = scoreBand(score);
  const rounded = Math.round(score);
  return `Score band: ${band} (${rounded}/100).`;
}
