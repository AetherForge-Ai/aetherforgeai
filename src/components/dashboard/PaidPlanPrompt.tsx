/** One paid-plan sentence. The link is always /pricing. */
export function PaidPlanPrompt({ detail }: { detail: string }) {
  return (
    <p className="rounded-2xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
      {detail}{" "}
      <a href="/pricing" className="font-medium text-primary hover:underline">
        See plans
      </a>
    </p>
  );
}
