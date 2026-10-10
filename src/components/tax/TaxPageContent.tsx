/**
 * General information drawn from the Inland Revenue pages linked below.
 * Sentences that are not on those pages are left out.
 * The paper-book totals are the member's ledger, not a tax return.
 */

import Link from "next/link";
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
] as const;

export function TaxPageContent({ book = null }: { book?: TaxBookFigures | null }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Tax</h1>
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
            Taxable income
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
          Cryptoassets are treated as a form of property for tax purposes. While there are different
          types of cryptoassets, the tax treatment depends on the characteristics and use of the
          cryptoassets. It does not depend on what they are called.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cryptoassets are not financial arrangements, they are excepted financial arrangements
          (except those economically equivalent to debt arrangements). This means that if your
          cryptoassets are trading stock they are valued at cost at the end of the tax year.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You need to file an income tax return - IR3 when you have taxable income from a cryptoasset
          activity.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Acquiring cryptoassets to sell or exchange</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If you acquire cryptoassets for the purpose of disposing of them you need to pay income tax
          on any profit you make. For example, if you buy or mine cryptoassets to sell or exchange
          them. If you make a loss when you sell your cryptoassets you may be able to claim this loss.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If your purpose for getting cryptoassets is to sell or exchange them, you&apos;ll need to pay
          income tax when you do. You may have more than one purpose for your cryptoassets at the time
          you acquire them. It is your main purpose that matters. Inland Revenue looks at your purpose
          at the time you acquire (for example, buy or mine) your cryptoassets. If that purpose changes
          later on, it does not matter.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          To claim a loss, you need to show that if you&apos;d made a profit it would have been taxable.
          You may still need to pay income tax even if you did not acquire your cryptoassets for the
          main purpose of disposing of them, such as if you&apos;re carrying on a profit-making scheme.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Taxing cryptoasset income</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You need to file an income tax return - IR3 when you have taxable income from a cryptoasset
          activity. Before you can add your cryptoasset net income (or loss) in your income tax return
          you must calculate the New Zealand dollar value of your cryptoasset transactions and work out
          your cryptoasset income and expenses.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          There are other rules you need to be aware of if your cryptoassets are trading stock.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Share investments</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Dividends companies pay are taxable income — this includes dividends from foreign companies.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          When a New Zealand company pays a dividend, they&apos;ll generally withhold tax and pay it to
          Inland Revenue on your behalf. The dividend income and tax credits will be added to your
          income tax assessment or individual income return IR3. You will need to check the amounts are
          correct.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          When you get a dividend from a foreign company, you need to pay tax in New Zealand. You will
          need to check if tax has been withheld and paid in New Zealand. If the amounts have not been
          added to your individual income tax return IR3, you will need to self-report this
          information. If you receive foreign dividends, you should file an Overseas income summary -
          IR1261 and claim foreign tax credits.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Foreign investment funds</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If you are a New Zealand tax resident, some overseas shares and other foreign investments can
          fall under the foreign investment fund (FIF) rules. Inland Revenue explains who those rules
          can apply to and how FIF income is calculated.
        </p>
        <p className="text-sm">
          <a
            href="https://www.ird.govt.nz/foreign-investment-funds"
            className="text-primary underline-offset-4 hover:underline"
            rel="noreferrer"
          >
            Inland Revenue — Foreign investment funds
          </a>
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
