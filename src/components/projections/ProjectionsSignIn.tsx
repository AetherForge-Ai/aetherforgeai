import Link from "next/link";
import { PROJECTIONS_MEMBER_LINE } from "@/lib/public-copy";

/** Signed-out projections. No figures and no ranked tickers. */
export function ProjectionsSignIn() {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">Projections</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{PROJECTIONS_MEMBER_LINE}</p>
      <Link
        href="/login?redirect=/projections"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Sign in
      </Link>
    </section>
  );
}
