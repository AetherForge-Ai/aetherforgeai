import Link from "next/link";
import { NO_CARD_TRIAL_TEXT, REFUND_TEXT, holdingCapsGrid } from "@/lib/holding-caps";

/** b65 G-07: caps grid + no-card trial + refund text. Rendered only when HOLDING_CAPS_V2=1 (OFF in prod). */
export function HoldingCapsGrid() {
  const rows = holdingCapsGrid();
  return (
    <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-6" aria-labelledby="holding-caps-title" data-g07-caps>
      <h2 id="holding-caps-title" className="font-display text-xl font-bold">Holdings on each plan</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70" tabIndex={0} role="region" aria-label="Holdings on each plan (scrolls sideways)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">Plan</th>
              <th scope="col" className="px-3 py-2">Price</th>
              <th scope="col" className="px-3 py-2">Holdings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t" data-g07-row={r.plan}>
                <th scope="row" className="px-3 py-2 font-semibold">{r.plan}</th>
                <td className="px-3 py-2 tnum">NZ${r.monthlyNzd.toFixed(2)}/month</td>
                <td className="px-3 py-2">{r.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm" data-g07-trial>{NO_CARD_TRIAL_TEXT}</p>
      <p className="mt-2 text-sm text-muted-foreground" data-g07-refund>
        {REFUND_TEXT}{" "}
        <Link href="/refunds" className="font-medium text-primary hover:underline">Refunds &amp; Cancellations</Link>
      </p>
    </section>
  );
}
