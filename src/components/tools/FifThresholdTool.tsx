"use client";

import { useState } from "react";
import { describeFifCost, formatCentsNzd, parseNzdInput } from "@/lib/nz-investor-tools";

const inputClass =
  "mt-3 h-11 min-h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function FifThresholdTool({ initialCost = "" }: { initialCost?: string }) {
  const [raw, setRaw] = useState(initialCost);
  const parsed = parseNzdInput(raw);
  const described = parsed.ok ? describeFifCost(parsed.cents) : null;
  const invalid = parsed.ok === false && parsed.reason === "invalid";

  return (
    <form className="mt-8" onSubmit={(event) => event.preventDefault()} noValidate data-calculator="fif">
      <label htmlFor="fif-cost" className="block text-sm font-medium">
        Total cost of your offshore shares (NZ$)
      </label>
      <p id="fif-cost-hint" className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Enter the total cost of the interests that count toward the threshold. Cost is generally what you paid, in New Zealand dollars, not today&apos;s market value. Nothing you type is saved.
      </p>
      <input
        id="fif-cost"
        name="fif-cost"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={invalid ? "fif-cost-hint fif-cost-error" : "fif-cost-hint"}
        aria-invalid={invalid || undefined}
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        className={inputClass}
      />
      {invalid ? (
        <p id="fif-cost-error" role="alert" className="mt-2 text-sm text-destructive">
          Enter a New Zealand dollar cost with at most two decimal places, such as 49999 or 50000.01.
        </p>
      ) : null}
      <div className="mt-6" aria-live="polite" data-fif-result>
        {described ? (
          <div className="rounded-2xl border border-border/70 bg-card/70 px-4 py-4 sm:px-5">
            <h2 className="font-display text-lg font-bold">{described.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed">{described.body}</p>
            <p className="mt-3 text-sm text-muted-foreground">Cost entered: {formatCentsNzd(parsed.ok ? parsed.cents : 0)}</p>
          </div>
        ) : !invalid ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Enter a cost to see whether it is over the NZ$50,000 threshold. The calculation stays in this browser.
          </p>
        ) : null}
      </div>
    </form>
  );
}
