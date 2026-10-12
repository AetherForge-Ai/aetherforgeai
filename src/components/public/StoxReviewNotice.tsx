import { stoxReviewCopy } from "@/lib/report-copy";

/** Public Stox example page. Member reports do not use this sentence. */
export function StoxReviewNotice() {
  return (
    <section className="mt-10" aria-label="Under review">
      <h2 className="font-display text-2xl font-bold">Under review</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{stoxReviewCopy()}</p>
    </section>
  );
}
