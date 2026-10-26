"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AI_PRIVACY_LABELS, type AiPrivacyMode } from "@/lib/ai-privacy";

/** G-26: rendered by /settings only when AI_PRIVACY_MODE=1. */
export function AiPrivacySetting({ initial }: { initial: AiPrivacyMode }) {
  const [mode, setMode] = useState<AiPrivacyMode>(initial);
  const [saving, setSaving] = useState(false);
  async function choose(next: AiPrivacyMode) {
    if (saving || next === mode) return;
    setSaving(true);
    const res = await api.post<{ mode: AiPrivacyMode }>("/api/settings/ai-privacy", { mode: next });
    setSaving(false);
    if (res.ok && res.data?.mode) {
      setMode(res.data.mode);
      toast.success("AI setting saved.");
    } else toast.error("That setting was not saved. Try again.");
  }
  return (
    <section className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-border/60 p-5" aria-labelledby="ai-privacy-h" data-af-ai-privacy>
      <h2 id="ai-privacy-h" className="font-display text-lg font-semibold">AI and privacy</h2>
      <fieldset className="mt-3 space-y-2" disabled={saving}>
        <legend className="sr-only">AI mode</legend>
        {(["on", "redacted", "off"] as const).map((m) => (
          <label key={m} className="flex items-start gap-2 text-sm">
            <input type="radio" name="ai-privacy" value={m} checked={mode === m} onChange={() => choose(m)} className="mt-1" />
            <span>{AI_PRIVACY_LABELS[m]}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
