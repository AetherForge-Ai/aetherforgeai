"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, User, CreditCard, Crown, ExternalLink, Sparkles, ShieldCheck, Mail, KeyRound } from "lucide-react";
import Link from "next/link";
import { planLabel } from "@/lib/plans";

interface SettingsUser {
  name: string;
  email: string;
  image?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  ticker_limit?: number | null;
  bot_access?: "stock" | "crypto" | "both" | "none" | null;
  hasCustomer: boolean;
  stripeConfigured: boolean;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function botAccessLabel(access?: string | null): string {
  if (access === "both") return "Stock + Crypto bots";
  if (access === "stock") return "Stock bot";
  if (access === "crypto") return "Crypto bot";
  return "No bot access";
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

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const isActive = user.subscription_status === "active";

  async function changeEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return toast.error("Enter a valid new email address.");
    if (email === user.email.toLowerCase()) return toast.error("That's already your email address.");
    setSavingEmail(true);
    console.log("[settings] Changing email…");
    const { error } = await authClient.changeEmail({
      newEmail: email,
      callbackURL: "/settings",
    });
    setSavingEmail(false);
    if (error) {
      console.error("[settings] Change email failed:", error);
      toast.error(error.message || "Could not change email.");
      return;
    }
    setNewEmail("");
    toast.success("Email updated. Check your inbox if a confirmation is required.");
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) return toast.error("Fill in both password fields.");
    if (newPassword.length < 8) return toast.error("New password must be at least 8 characters.");
    setSavingPassword(true);
    console.log("[settings] Changing password…");
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setSavingPassword(false);
    if (error) {
      console.error("[settings] Change password failed:", error);
      toast.error(error.message || "Could not change password.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.success("Password updated.");
  }

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
              <p className="font-semibold">{isActive ? planLabel(user.subscription_plan) : "Free account"}</p>
              <p className="text-sm text-muted-foreground">
                {isActive ? `${botAccessLabel(user.bot_access)} · active` : "You're on the free plan."}
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

        {isActive && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">Purchased</p>
              <p className="mt-0.5 text-sm font-medium">{fmtDate(user.subscription_started_at)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">Expires</p>
              <p className="mt-0.5 text-sm font-medium">{fmtDate(user.subscription_expires_at)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">Ticker limit</p>
              <p className="mt-0.5 text-sm font-medium">
                {user.ticker_limit ? `${user.ticker_limit} per bot` : "—"}
              </p>
            </div>
          </div>
        )}

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

      {/* Account security */}
      <section className="mt-6 rounded-3xl border border-border/70 bg-card/50 p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <h2 className="font-display text-lg font-bold">Account security</h2>
        </div>

        {/* Change email */}
        <div className="mt-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="size-4 text-primary" /> Change email address
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-email">Current email</Label>
              <Input id="current-email" value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">New email</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="you@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={changeEmail} disabled={savingEmail}>
              {savingEmail ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Mail className="mr-2 size-4" />}
              Update email
            </Button>
          </div>
        </div>

        <div className="my-6 h-px bg-border/60" />

        {/* Change password */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-primary" /> Change password
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={changePassword} disabled={savingPassword}>
              {savingPassword ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}
              Update password
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
