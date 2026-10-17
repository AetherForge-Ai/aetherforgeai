import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { DEMO_BOOK } from "@/lib/demo-book";

export const metadata = publicPageMetadata("/demo", {
  title: "Example book (read-only) · AetherForge AI",
  description: "A read-only example of the AetherForge paper book. Synthetic rows only, no member data.",
});

/** Goal b10 G-06: signed-out, read-only demo book. Synthetic rows, no prices or profit. */
export default function DemoPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6" data-demo-book>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Example</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Example book (read-only)</h1>
        <p className="mt-3 text-sm text-muted-foreground">{DEMO_BOOK.notice}</p>
        <section className="mt-8" aria-labelledby="demo-holdings">
          <h2 id="demo-holdings" className="font-display text-xl font-semibold">Holdings</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 font-medium">Name</th>
                <th scope="col" className="py-2 font-medium">Type</th>
                <th scope="col" className="py-2 font-medium">Quantity</th>
                <th scope="col" className="py-2 font-medium">Price</th>
                <th scope="col" className="py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_BOOK.holdings.map((h) => (
                <tr key={h.name} className="border-b last:border-0">
                  <td className="py-2">{h.name}</td>
                  <td className="py-2">{h.type}</td>
                  <td className="py-2">{h.quantity}</td>
                  <td className="py-2" title={DEMO_BOOK.noPriceReason}>—</td>
                  <td className="py-2" title={DEMO_BOOK.noPriceReason}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">— {DEMO_BOOK.noPriceReason}</p>
        </section>
        <section className="mt-8" aria-labelledby="demo-ledger">
          <h2 id="demo-ledger" className="font-display text-xl font-semibold">Entries</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {DEMO_BOOK.entries.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
        <section className="mt-8" aria-labelledby="demo-report">
          <h2 id="demo-report" className="font-display text-xl font-semibold">Example report</h2>
          <p className="mt-3 text-sm text-muted-foreground">{DEMO_BOOK.report}</p>
        </section>
        <p className="mt-10 text-sm">
          This page is read-only. <Link className="font-semibold text-primary hover:underline" href="/register">Create a free account</Link> to keep your own book.
        </p>
      </main>
    </div>
  );
}
