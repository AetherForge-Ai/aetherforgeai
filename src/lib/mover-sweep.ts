/** Stox keeps the share-price wording. Koins names crypto gainers. */
export function moverSweepCaption(bot: string | undefined, style: "screen" | "html" = "screen"): string {
  const subject = bot === "crypto" ? "Biggest crypto gainers" : "Biggest share-price gainers";
  if (style === "html") {
    return `${subject} across each exchange over the last 24 hours, 7 days and month.`;
  }
  return `${subject} on each exchange over 24 hours, 7 days and the last month.`;
}
