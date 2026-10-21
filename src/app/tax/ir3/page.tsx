import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CsvExportButton } from "@/components/tax/CsvExportButton";
import { TaxSectionNav } from "@/components/tax/TaxSectionNav";
import { canExportCsv } from "@/lib/entitlements";
import { formatNzd } from "@/lib/currency";
import { IR3_LABEL, IR3_SOURCES, type Ir3Helper } from "@/lib/ir3/ir3-helper";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { buildFullTaxPack } from "@/lib/tax-pack-build.server";

export const dynamic = "force-dynamic";

export const metadata = {
  ...publicPageMetadata("/tax/ir3", {
    title: "IR3 helper · AetherForge AI",
    description: "Which tax pack figure goes where on the IR3. Indicative, not tax advice.",
  }),
  robots: { index: false, follow: false },
};

const money = (v: number | null) => (v == null ? "—" : formatNzd(v));

export default async function Ir3Page({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await getCurrentUser();
  const shellUser = user
    ? { name: user.name, email: user.email, image: user.image, subscription_status: user.subscription_status, subscription_plan: user.subscription_plan }
    : { name: "Guest", email: "Sign in to activate your account" };
  const current = nzTaxYearEnding(aucklandCivilToday()) ?? new Date().getFullYear();
  const requested = Number((await searchParams).year);
  const endingYear = isNzTaxYearEnding(requested) ? requested : current;
  const years = [...new Set([2026, current, endingYear])].sort();
  let helper: Ir3Helper | null = null;
  let readError = false;
  if (user) {
    try {
      helper = (await buildFullTaxPack(user._id, endingYear)).ir3;
    } catch {
      readError = true;
    }
  }
  return (
    <AppShell user={shellUser} guest={!user}>
      <article className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
        <h1 className="mt-2 font-display text-3xl font-bold">IR3 helper</h1>
        <TaxSectionNav current="/tax/ir3" />
        <p className="mt-4 text-sm font-semibold">{IR3_LABEL}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Which figure from your tax pack goes where on the IR3 for {nzTaxYearLabel(endingYear)}. The figures come from the same
          calculation as the FIF working paper and income summary.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
          {years.map((year) => (
            <Link
              key={year}
              href={`/tax/ir3?year=${year}`}
              className={year === endingYear ? "rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary" : "rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"}
            >
              {nzTaxYearLabel(year)}
            </Link>
          ))}
          {user && !readError ? (
            <>
              <CsvExportButton href={`/api/tax/ir3/export?year=${endingYear}`} allowed={canExportCsv(user.subscription_plan)} exportName="IR3 helper CSV" />
              <CsvExportButton primary={false} href={`/api/tax/pack/pdf?paper=all&year=${endingYear}`} allowed={canExportCsv(user.subscription_plan)} exportName="Tax pack PDF" idleLabel="PDF" />
            </>
          ) : null}
        </div>
        {!user ? <p className="mt-6 text-sm">Sign in to see your IR3 helper.</p> : null}
        {readError ? <p className="mt-6 text-sm" role="alert">Your tax figures could not be read. Try again shortly.</p> : null}
        {helper ? (
          <>
            <h2 className="mt-8 text-xl font-semibold">IR1261 overseas income lines</h2>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">IR1261 lines</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col">Income type</th>
                  <th scope="col">Jurisdiction</th>
                  <th scope="col" className="text-right">Gross NZ$</th>
                  <th scope="col" className="text-right">Tax credit NZ$</th>
                </tr>
              </thead>
              <tbody>
                {helper.lines.length ? (
                  helper.lines.map((l, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td>{l.incomeType}{l.note ? <span className="block text-xs text-muted-foreground">{l.note}</span> : null}</td>
                      <td>{l.jurisdiction}</td>
                      <td className="text-right tabular-nums">{money(l.grossNzd)}</td>
                      <td className="text-right tabular-nums">{money(l.creditNzd)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4}>No overseas income in this tax year.</td></tr>
                )}
              </tbody>
            </table>
            <h2 className="mt-8 text-xl font-semibold">IR3 totals</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              {helper.totals.map((t) => (
                <div key={t.key} className="flex justify-between border-t border-border/60 pt-2">
                  <dt>{t.box ? `Box ${t.box} · ` : ""}{t.item}</dt>
                  <dd className="tabular-nums">{money(t.valueNzd)}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-6 list-disc pl-5 text-sm text-muted-foreground">
              {helper.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </>
        ) : null}
        <h2 className="mt-8 text-base font-semibold">Sources</h2>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {IR3_SOURCES.map((s) => (
            <li key={s.href}><a className="underline" href={s.href} rel="noopener noreferrer" target="_blank">{s.label}</a></li>
          ))}
        </ul>
      </article>
    </AppShell>
  );
}
