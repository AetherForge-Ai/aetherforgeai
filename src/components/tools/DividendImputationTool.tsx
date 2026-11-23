"use client";

import { useState } from "react";
import {
  describeImputation,
  formatCentsNzd,
  illustrateFullyImputedDividend,
  INDIVIDUAL_MARGINAL_RATES,
  parseNzdInput,
} from "@/lib/nz-investor-tools";

const fieldClass =
  "mt-3 h-11 min-h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function DividendImputationTool({
  initialCash = "",
  initialRate = "",
}: {
  initialCash?: string;
  initialRate?: string;
}) {
  const [raw, setRaw] = useState(initialCash);
  const [rateId, setRateId] = useState(initialRate);
  const parsed = parseNzdInput(raw);
  const invalid = parsed.ok === false && parsed.reason === "invalid";
  const illustrated = parsed.ok && rateId ? illustrateFullyImputedDividend(parsed.cents, rateId) : null;
  const creditOnly = parsed.ok ? illustrateFullyImputedDividend(parsed.cents, "33") : null;
  const described = illustrated ? describeImputation(illustrated) : null;

  return (
    <form className="mt-8 space-y-6" onSubmit={(event) => event.preventDefault()} noValidate data-calculator="dividend">
      <div>
        <label htmlFor="dividend-cash" className="block text-sm font-medium">
          Cash dividend (NZ$)
        </label>
        <p id="dividend-cash-hint" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This is the profit share before imputation credits, the 72 in the 28:72 ratio. It is not the amount after resident withholding tax. Nothing you type is saved.
        </p>
        <input
          id="dividend-cash"
          name="dividend-cash"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={invalid ? "dividend-cash-hint dividend-cash-error" : "dividend-cash-hint"}
          aria-invalid={invalid || undefined}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          className={fieldClass}
        />
        {invalid ? (
          <p id="dividend-cash-error" role="alert" className="mt-2 text-sm text-destructive">
            Enter a New Zealand dollar amount with at most two decimal places, such as 720 or 720.00.
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="dividend-rate" className="block text-sm font-medium">
          Marginal rate
        </label>
        <p id="dividend-rate-hint" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Choose one individual rate from 1 April 2025. The illustration taxes the whole gross dividend at that rate. It does not split the dividend across bands.
        </p>
        <select
          id="dividend-rate"
          name="dividend-rate"
          aria-describedby="dividend-rate-hint"
          value={rateId}
          onChange={(event) => setRateId(event.target.value)}
          className={fieldClass}
        >
          <option value="">Choose a rate</option>
          {INDIVIDUAL_MARGINAL_RATES.map((rate) => (
            <option key={rate.id} value={rate.id}>
              {rate.label} — {rate.band}
            </option>
          ))}
        </select>
      </div>
      <div aria-live="polite" data-imputation-result>
        {parsed.ok && creditOnly ? (
          <div className="rounded-2xl border border-border/70 bg-card/70 px-4 py-4 sm:px-5">
            <h2 className="font-display text-lg font-bold">Fully imputed at 28:72</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <dt>Cash dividend</dt>
                <dd className="font-medium tabular-nums">{formatCentsNzd(creditOnly.cashCents)}</dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <dt>Imputation credit (28/72)</dt>
                <dd className="font-medium tabular-nums">{formatCentsNzd(creditOnly.imputationCents)}</dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <dt>Gross dividend</dt>
                <dd className="font-medium tabular-nums">{formatCentsNzd(creditOnly.grossCents)}</dd>
              </div>
            </dl>
            {described && illustrated ? (
              <div className="mt-4 border-t border-border/70 pt-4">
                <h3 className="font-display text-base font-bold">{described.heading}</h3>
                <dl className="mt-3 space-y-3 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <dt>Tax on the gross dividend at {illustrated.rateLabel}</dt>
                    <dd className="font-medium tabular-nums">{formatCentsNzd(illustrated.taxCents)}</dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <dt>Less imputation credit</dt>
                    <dd className="font-medium tabular-nums">{formatCentsNzd(illustrated.imputationCents)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm leading-relaxed">{described.body}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Choose a marginal rate to see the top-up, or the unused credit, on this dividend.
              </p>
            )}
          </div>
        ) : parsed.ok ? (
          <p className="text-sm leading-relaxed text-muted-foreground">That amount is too large for this illustration.</p>
        ) : !invalid ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Enter a cash dividend to see the gross dividend. The calculation stays in this browser.
          </p>
        ) : null}
      </div>
    </form>
  );
}
