import { CSV_LOCK_LABEL, csvLockAccessibleName } from "@/lib/csv-lock-label";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";
/**
 * General information drawn from the Inland Revenue pages linked below.
 * Sentences that are not on those pages are left out.
 * The paper-book totals are the member's ledger, not a tax return.
 */

import Link from "next/link";
import { TaxSectionNav } from "@/components/tax/TaxSectionNav";
import { formatNzd, formatSignedMoney } from "@/lib/currency";
import { fifThresholdText } from "@/lib/fif-working-paper";
import { taxGrossDividendSentence } from "@/lib/tax-book";
import { COST_METHOD_LABEL } from "@/lib/lot-day";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import { TAX_PACK_NOTE } from "@/lib/tax-pack";
import { TAX_PAGE_EXAMPLE, TAX_PAGE_SUMMARIES } from "@/lib/tax-public-summary";

export type TaxBookFigures = {
  dividendsNzd: number;
  dividendsGrossNzd?: number | null;
  realisedPnlNzd: number;
};

const SOURCES = [
  {
    href: "https://www.ird.govt.nz/cryptoassets",
    label: "Inland Revenue — Cryptoassets",
  },
  {
    href: "https://www.ird.govt.nz/cryptoassets/individual/buying-selling/acquiring-sell-exchange",
    label: "Inland Revenue — Acquiring, selling and exchanging cryptoassets",
  },
  {
    href: "https://www.ird.govt.nz/cryptoassets/taxing",
    label: "Inland Revenue — Taxing cryptoassets",
  },
  {
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/share-investments",
    label: "Inland Revenue — Share investments",
  },
  {
    href: "https://www.ird.govt.nz/foreign-investment-funds",
    label: "Inland Revenue — Foreign investment funds",
  },
  {
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/overseas-income",
    label: "Inland Revenue — Overseas income and foreign tax credits",
  },
] as const;

export function TaxPageContent({ book = null, xero = "guest" }: { book?: TaxBookFigures | null; xero?: "paid" | "free" | "guest" }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Tax</h1>
      <TaxSectionNav current="/tax" />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        This is general information and not personal tax advice. Last reviewed 8 Oct 2026.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
      {/* b26 H-9: one download for the whole tax year. */}
      <section className="mt-4 rounded-md border p-3 text-sm" data-tax-pack>
        <h2 className="font-semibold">Tax pack (PDF, or ZIP with the CSVs)</h2>
        <p className="mt-1 text-muted-foreground">
          FIF working paper, realised profit and loss, income summary, dividend ledger and the FX rates used (with source and date), for the tax year 1 April to 31 March. {TAX_INDICATIVE_LABEL}
        </p>
        {xero === "paid" ? (
          <span className="mt-2 flex flex-wrap gap-2">
            <a href="/api/tax/pack/pdf?paper=all" className="inline-flex min-h-11 items-center rounded-md border px-4 font-medium" data-tax-pack-download>
              Download tax pack (PDF)
            </a>
            {/* b29 H-9: PDF + realised, dividends, FIF, income, positions, trades and corporate-action CSVs. */}
            <a href="/api/tax/pack/zip" className="inline-flex min-h-11 items-center rounded-md border px-4 font-medium" data-tax-pack-zip>
              Download tax pack (ZIP with CSVs)
            </a>
          </span>
        ) : xero === "free" ? (
          <span aria-disabled="true" className="mt-2 inline-flex min-h-11 items-center rounded-md border px-4 font-medium text-muted-foreground" aria-label={csvLockAccessibleName("Tax pack")} data-csv-locked>
            {/* b36 G-09 (GOAL-LOCK #44): the exact lock wording on every locked export. */}
            {CSV_LOCK_LABEL} (tax pack PDF and ZIP)
          </span>
        ) : (
          <Link href="/login?redirect=/tax" className="mt-2 inline-flex min-h-11 items-center rounded-md border px-4 font-medium">Sign in to download</Link>
        )}
      </section>
      {/* Goal b20 G-29: the Xero export where accountants look; Free sees the lock. */}
      <section id="xero" className="mt-4 scroll-mt-24 rounded-md border p-3 text-sm" data-tax-xero>
        <h2 className="font-semibold">Xero CSV (for your accountant)</h2>
        <p className="mt-1 text-muted-foreground">
          A Xero bank-statement import file of NZD cash movements. Columns: Date, Amount, Payee, Description, Reference.
          In Xero, use Import a statement on the bank account.
        </p>
        {xero === "paid" ? (
          <a href="/api/transactions/export?format=xero" className="mt-2 inline-flex min-h-11 items-center rounded-md border px-4 font-medium" data-xero-export>
            Download Xero CSV
          </a>
        ) : xero === "free" ? (
          <span aria-disabled="true" className="mt-2 inline-flex min-h-11 items-center rounded-md border px-4 font-medium text-muted-foreground" data-xero-export aria-label="Xero CSV: CSV export: Starter and above">
            CSV export: Starter and above (Xero CSV)
          </span>
        ) : (
          <Link href="/login?redirect=/tax" className="mt-2 inline-flex min-h-11 items-center rounded-md border px-4 font-medium">
            Sign in to export
          </Link>
        )}
      </section>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
        <li>
          <Link href="/tax/dividends" className="text-primary underline-offset-4 hover:underline">
            Dividend ledger
          </Link>
        </li>
        <li>
          <Link href="/tax/income" className="text-primary underline-offset-4 hover:underline">
            Income summary (indicative)
          </Link>
        </li>
        <li>
          <Link href="/tax/fif" className="text-primary underline-offset-4 hover:underline">
            FIF working paper
          </Link>
        </li>
        <li>
          <Link href="/tax/realised" className="text-primary underline underline-offset-4">
            Realised profit and loss
          </Link>
        </li>
      </ul>
      {book ? (
        <section className="mt-6 space-y-2 rounded-2xl border border-border/70 bg-card/40 p-4">
          <h2 className="font-display text-lg font-semibold">Your paper book</h2>
          <p className="text-sm text-muted-foreground">{COST_METHOD_LABEL}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Dividends on this book, net cash received: {formatNzd(book.dividendsNzd)}.{" "}
            {taxGrossDividendSentence(book.dividendsGrossNzd)}{" "}
            Realised profit and loss: {formatSignedMoney(book.realisedPnlNzd)}. Net cash is the amount that landed
            in the paper book. Gross is the dividend before withholding, and only when that breakdown is on the row.
            These figures are from your paper book. They are not a tax return. {TAX_PACK_NOTE} {TAX_INDICATIVE_LABEL}{" "}
            Inland Revenue decides what is income.
          </p>
        </section>
      ) : null}

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Cryptoassets</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Inland Revenue treats cryptoassets as property. The tax result follows how the asset is used,
          including when it was acquired in order to sell or exchange it. A disposal can produce income
          or a loss. The linked pages set out the return and the New Zealand dollar figures.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Share dividends and foreign tax credits</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Dividends, including dividends from foreign companies, can be taxable income. A New Zealand
          company often withholds tax before the cash is paid. A foreign dividend may have had tax
          withheld overseas. United States portfolio dividends are often reduced by 15 percent before
          the cash arrives. Inland Revenue&apos;s foreign tax credit is capped at the New Zealand tax on
          that same foreign income, so the credit cannot be larger than the New Zealand tax on it.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The share-investment and foreign-tax-credit pages linked below are the Inland Revenue
          descriptions of those rules, including the overseas income summary IR1261.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Foreign investment funds</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Some overseas shares held by a New Zealand tax resident can fall under the foreign investment
          fund rules. Inland Revenue explains when those rules can apply and how the income is
          calculated. The working paper on this site includes Australian-listed shares in the {fifThresholdText()}
          cost total. A holding that meets the Australian exemption can be left out by the member.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="font-display text-lg font-semibold">What each page does</h2>
        {TAX_PAGE_SUMMARIES.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="font-display text-base font-semibold">{section.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </div>
        ))}
        <p className="text-sm leading-relaxed text-muted-foreground">{TAX_PAGE_EXAMPLE}</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Inland Revenue pages used</h2>
        <ul className="space-y-2 text-sm">
          {SOURCES.map((source) => (
            <li key={source.href}>
              <a href={source.href} className="text-primary underline-offset-4 hover:underline" rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <DisclaimerNotice variant="full" className="mt-8" />
    </article>
  );
}
