import type { Metadata } from "next";
import Link from "next/link";
import { PAPER_FEE_SUMMARY } from "@/lib/fee-rule";

export const metadata: Metadata = {
  title: "How the books work · AetherForge AI",
  description: "Paper money, data sources, security, the fee rule, and what this is not.",
};

export default function TrustPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-bold">How the books work</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        A short note on what the signed-in portfolio is, where the numbers come from, and what they are not.
      </p>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-lg font-bold">Paper, not a broker</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cash, holdings and the ledger are a paper book on AetherForge. Recording a buy does not send money to a
          broker, an exchange, or a bank. A sell does not pay you. Nothing here moves real money.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-lg font-bold">Where prices come from</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Share prices use public market data. The coin list uses CoinGecko. DEX tokens use GeckoTerminal. Gold and
          silver use a published spot price, shown in NZ dollars per ounce. Exchange rates use a daily FX feed. A past
          date suggests that day’s close and that day’s rate. You can type over either figure before you confirm.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-lg font-bold">Security</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The book is tied to your signed-in account. Another member cannot read it. We do not ask for a broker login,
          and we do not store a password for a bank or an exchange.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-lg font-bold">The fee rule</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{PAPER_FEE_SUMMARY}</p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-lg font-bold">Not financial advice</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The figures, bots and notes are general information. They are not a recommendation to buy or sell, and they
          do not consider your circumstances. Read the{" "}
          <Link href="/ai-disclaimer" className="font-semibold text-primary underline-offset-2 hover:underline">
            AI disclaimer
          </Link>{" "}
          before you act.
        </p>
      </section>
    </main>
  );
}
