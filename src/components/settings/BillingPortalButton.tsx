"use client";

import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** Opens the existing Stripe customer portal. It does not start a new checkout. */
export function BillingPortalButton() {
  const [busy, setBusy] = useState(false);

  async function openPortal() {
    setBusy(true);
    const res = await api.post<{ url: string }>("/api/stripe/portal", {});
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    console.error("[settings] Portal failed:", res.error);
    toast.error("Could not open billing portal.");
    setBusy(false);
  }

  return (
    <Button variant="outline" onClick={openPortal} disabled={busy}>
      {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ExternalLink className="mr-2 size-4" />}
      Manage billing
    </Button>
  );
}
