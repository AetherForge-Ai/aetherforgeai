"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_EMAIL_PREFS,
  EMAIL_PREF_FIELDS,
  type EmailPrefs,
} from "@/lib/notification-prefs";

export function NotificationsPanel() {
  const [prefs, setPrefs] = useState<EmailPrefs>(DEFAULT_EMAIL_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/account/notifications");
      const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: EmailPrefs } | null;
      if (!active) return;
      if (res.ok && body?.ok && body.data) setPrefs(body.data);
      setLoading(false);
    })().catch((err) => {
      console.error("[settings] Notification choices failed to load:", err);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/account/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Could not save notification choices.");
      return;
    }
    toast.success("Notification choices saved on this browser. No email was sent.");
  }

  return (
    <section className="mt-8 rounded-3xl border border-border/70 bg-card/50 p-6">
      <h2 className="font-display text-lg font-bold">Email notifications</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Choose which notes to prepare. Sending is off, so a choice only saves on this browser and can write a preview
        to the server log. No email is sent.
      </p>
      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading choices…
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {EMAIL_PREF_FIELDS.map((field) => (
            <li key={field.key} className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{field.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{field.detail}</p>
              </div>
              <Switch
                checked={prefs[field.key]}
                onCheckedChange={(checked) => setPrefs((prev) => ({ ...prev, [field.key]: checked }))}
                aria-label={field.label}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={loading || saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save choices
        </Button>
      </div>
    </section>
  );
}
