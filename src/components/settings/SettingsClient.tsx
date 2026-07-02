"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, User, CreditCard, Crown, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";

interface SettingsUser {
  name: string;
  email: string;
  image?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  hasCustomer: boolean;
  stripeConfigured: boolean;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SettingsClient({ user }: { user: SettingsUser }) {
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState(user.image ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const isActive = user.subscription_status === "active";

  async function saveProfile() {
    if (!name.trim()) return toast.error("Name cannot be empty.");
    setSavingProfile(true);
    console.log("[settings] Saving profile…");
    const res = await api.put("/api/profile", {
      name: name.trim(),
      image: image.trim() || null,
    });
    setSavingProfile(false);
    if (res.ok) {
      toast.success("Profile updated");
    } else {
      console.error("[settings] Profile save failed:", res.error);
      toast.error("Could not save your profile.");
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    console.log("[settings] Opening billing portal…");
    const res = await api.post<{ url: string }>("/api/stripe/portal", {});
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
    } else {
      console.error("[settings] Portal failed:", res.error);
      toast.error("Could not open billing portal.");
      setPortalLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and subscription.
        </p>
      </div>

      {/* Profile */}
      <section className="mt-8 rounded-3xl border border-border/70 bg-card/50 p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <User className="size-4" />
          </span>
          <h2 className="font-display text-lg font-bold">Profile</h2>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Avatar className="size-16">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback className="bg-primary/15 text-lg font-semibold text-primary">
              {initials(name || "U")}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm">
            <p className="font-medium">{user.email}</p>
            <p className="text-muted-foreground">Signed in</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} disabled />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="image">Avatar URL (optional)</Label>
            <Input
              id="image"
              placeholder="https://…"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={saveProfile} disabled={savingProfile} className="font-semibold">
            {savingProfile ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </section>

      {/* Billing */}
      <section className="mt-6 rounded-3xl border border-border/70 bg-card/50 p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <CreditCard className="size-4" />
          </span>
          <h2 className="font-display text-lg font-bold">Subscription & billing</h2>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/30 p-5">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-11 place-items-center rounded-xl",
                isActive ? "bg-[var(--gold)]/15 text-[var(--gold)]" : "bg-primary/12 text-primary"
              )}
            >
              {isActive ? <Crown className="size-5" /> : <Sparkles className="size-5" />}
            </span>
            <div>
              <p className="font-semibold">{isActive ? "AetherForge Pro" : "Free account"}</p>
              <p className="text-sm text-muted-foreground">
                {isActive
                  ? `${user.subscription_plan === "yearly" ? "Yearly" : "Monthly"} plan · active`
                  : "You're on the free plan."}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              isActive
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isActive ? "Active" : (user.subscription_status || "none").toUpperCase()}
          </span>
        </div>

        <div className="mt-5">
          {!user.stripeConfigured ? (
            <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-400/90">
              Billing isn't configured yet. Add a Stripe key to the project to enable subscriptions.
            </p>
          ) : user.hasCustomer ? (
            <Button variant="outline" onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 size-4" />
              )}
              Manage billing
            </Button>
          ) : (
            <Button asChild className="font-semibold shadow-glow">
              <Link href="/pricing">
                <Sparkles className="mr-2 size-4" /> Upgrade to AetherForge Pro
              </Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
