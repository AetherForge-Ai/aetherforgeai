/**
 * General information drawn from the Inland Revenue pages linked below.
 * Sentences that are not on those pages are left out.
 * The paper-book totals are the member's ledger, not a tax return.
 */

import Link from "next/link";
import { TaxSectionNav } from "@/components/tax/TaxSectionNav";
import { formatNzd, formatSignedMoney } from "@/lib/currency";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";

export type TaxBookFigures = {
  dividendsNzd: number;
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
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/foreign-income/foreign-tax-credits",
    label: "Inland Revenue — Foreign tax credits",
  },
] as const;

export function TaxPageContent({ book = null }: { book?: TaxBookFigures | null }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Tax</h1>
      <TaxSectionNav current="/tax" />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        This is general information and not personal tax advice. Last reviewed 8 Oct 2026.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
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
          <Link href="/tax/realised" className="text-primary underline-offset-4 hover:underline">
            Realised profit and loss
          </Link>
        </li>
      </ul>
      {book ? (
        <section className="mt-6 space-y-2 rounded-2xl border border-border/70 bg-card/40 p-4">
          <h2 className="font-display text-lg font-semibold">Your paper book</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Dividends and income on this book: {formatNzd(book.dividendsNzd)}. Realised profit and loss:{" "}
            {formatSignedMoney(book.realisedPnlNzd)}. These figures are from your paper book. They are not a tax
            return. Inland Revenue decides what is income.
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
          calculated. The working paper on this site includes Australian-listed shares in the NZ$50,000
          cost total. A holding that meets the Australian exemption can be left out by the member.
        </p>
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
    </article>
  );
}
