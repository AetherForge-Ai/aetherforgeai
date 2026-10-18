"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * b29 H-9: per-portfolio FIF threshold. NZ$50,000 (default) or NZ$100,000 for a jointly held
 * portfolio — the larger figure is always labelled "jointly held" (it is not the individual limit,
 * and the proposed NZ$100k individual change is not law). Saving reloads the paper with the value.
 */
export function FifThresholdSetting({ initialNzd }: { initialNzd: number }) {
  const router = useRouter();
  const [value, setValue] = useState(initialNzd === 100000 ? 100000 : 50000);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  async function save(next: number) {
    setValue(next);
    setState("saving");
    const res = await fetch("/api/tax/fif/threshold", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thresholdNzd: next }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { label?: string } } | null;
    if (res?.ok && body?.ok) {
      setState("saved");
      setMessage(`Saved: ${body.data?.label ?? ""}`);
      router.refresh();
    } else {
      setState("error");
      setMessage(body?.error || "The threshold was not saved. Try again.");
    }
  }
  return (
    <fieldset className="mt-3 rounded-xl border border-border/70 p-3 text-sm print:hidden" data-fif-threshold-setting>
      <legend className="px-1 font-semibold">FIF threshold for this portfolio</legend>
      <label className="mr-4 inline-flex items-center gap-2">
        <input type="radio" name="fif-threshold" checked={value === 50000} disabled={state === "saving"} onChange={() => void save(50000)} />
        NZ$50,000 (default)
      </label>
      <label className="inline-flex items-center gap-2">
        <input type="radio" name="fif-threshold" checked={value === 100000} disabled={state === "saving"} onChange={() => void save(100000)} />
        NZ$100,000 (2 equal owners, no other FIF holdings)
      </label>
      <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
        {state === "saving" ? "Saving…" : message || "Saved for this portfolio. The working paper and the tax pack print the value used."}
      </p>
    </fieldset>
  );
}
