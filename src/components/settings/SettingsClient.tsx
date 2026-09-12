"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, User, CreditCard, Crown, ExternalLink, Sparkles, ShieldCheck, Mail, KeyRound, ArrowUpCircle, Check, Zap, CalendarClock, Camera } from "lucide-react";
import Link from "next/link";
import { PLANS, planByKey, planLabel, type Plan } from "@/lib/plans";
import { formatUsdApprox } from "@/lib/currency";
import { useFxRates } from "@/hooks/useFxRates";
import { COUNTRIES } from "@/lib/countries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SettingsUser {
  name: string;
  email: string;
  image?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  country?: string | null;
  phone?: string | null;
  secondary_email?: string | null;
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


/** Resize + compress a picked image to a JPEG data URL suitable for profile storage. */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB.");
  }
  const bitmap = await createImageBitmap(file);
  const max = 512;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let quality = 0.86;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 700_000 && quality > 0.45) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > 900_000) {
    throw new Error("Image is still too large after compression — try another photo.");
  }
  return dataUrl;
}

export function SettingsClient({ user }: { user: SettingsUser }) {
  const split = (user.name || "").trim().split(/\s+/);
  const inferredFirst = user.first_name || split[0] || "";
  const inferredLast = user.last_name || (split.length > 1 ? split.slice(1).join(" ") : "");

  const [firstName, setFirstName] = useState(inferredFirst);
  const [lastName, setLastName] = useState(inferredLast);
  const [country, setCountry] = useState(user.country || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [secondaryEmail, setSecondaryEmail] = useState(user.secondary_email || "");
  const [image, setImage] = useState(user.image ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Plan switching (with automatic proration)
  const [upgradingPrice, setUpgradingPrice] = useState<string | null>(null);
  const [applyWhen, setApplyWhen] = useState<"now" | "next_cycle">("now");

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const isActive = user.subscription_status === "active";
  const currentPlan = planByKey(user.subscription_plan);
  // Rank plans by price so we can label each option as an upgrade or a change.
  const currentPrice = currentPlan?.price ?? 0;
  const preferredBot: "stock" | "crypto" = user.bot_access === "crypto" ? "crypto" : "stock";
  // Live NZD→USD rate so each NZ$ plan price shows its US$ equivalent.
  const { rates: fx } = useFxRates();
  // Other paid plans the member can switch to from their current subscription.
  const switchOptions = PLANS.filter((p) => p.key !== user.subscription_plan);

  const displayName = `${firstName} ${lastName}`.trim() || user.name;

  async function onPickAvatar(file: File | null) {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setImage(dataUrl);
      toast.success("Photo ready — click Save changes to keep it.");
    } catch (err: any) {
      console.error("[settings] Avatar upload failed:", err);
      toast.error(err?.message || "Could not use that image.");
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
    if (!firstName.trim()) return toast.error("First name is required.");
    if (!lastName.trim()) return toast.error("Last name is required.");
    if (!country.trim()) return toast.error("Please select your country.");
    if (secondaryEmail.trim() && !secondaryEmail.includes("@")) {
      return toast.error("Enter a valid backup email, or leave it blank.");
    }
    setSavingProfile(true);
    console.log("[settings] Saving profile…");
    const res = await api.put("/api/profile", {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      country: country.trim(),
      phone: phone.trim() || null,
      secondary_email: secondaryEmail.trim() || null,
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

  async function switchPlan(plan: Plan) {
    setUpgradingPrice(plan.priceId);
    console.log(`[settings] Switching plan → ${plan.key} (${applyWhen})`);
    const res = await api.post<{ plan: string; proration: boolean }>("/api/stripe/upgrade", {
      priceId: plan.priceId,
      plan: plan.key,
      bot: preferredBot,
      when: applyWhen,
    });
    setUpgradingPrice(null);
    if (res.ok) {
      toast.success(
        applyWhen === "now"
          ? `Now on ${plan.name} — the prorated difference was applied to your card.`
          : `${plan.name} is scheduled to start at your next renewal.`
      );
      // Give the toast a beat, then reload so the plan panel reflects the change.
      setTimeout(() => window.location.reload(), 1400);
    } else {
      console.error("[settings] Plan switch failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not change your plan.");
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

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label="Upload profile photo"
          >
            <Avatar className="size-20 ring-2 ring-border/70 transition group-hover:ring-primary/50">
              {image ? <AvatarImage src={image} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/15 text-lg font-semibold text-primary">
                {initials(displayName || "U")}
              </AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
              {uploadingAvatar ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Camera className="size-5" />
              )}
            </span>
          </button>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{user.email}</p>
            <p className="text-muted-foreground">Signed in</p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary hover:underline"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? "Processing photo…" : "Upload an avatar from your device"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first-name">First name</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last-name">Last name</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="country">Country</Label>
            <Select value={country || undefined} onValueChange={setCountry}>
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder="Select the country you live in" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Cell phone number (optional)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+64 …"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secondary-email">Secondary backup email</Label>
            <Input
              id="secondary-email"
              type="email"
              placeholder="backup@example.com"
              value={secondaryEmail}
              onChange={(e) => setSecondaryEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">Primary email</Label>
            <Input id="email" value={user.email} disabled />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="image">Avatar URL (optional)</Label>
            <Input
              id="image"
              placeholder="https://…"
              value={image.startsWith("data:image/") ? "" : image}
              onChange={(e) => setImage(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste an image link, or click your profile picture above to upload from your device.
              {image.startsWith("data:image/") ? " A device photo is ready to save." : ""}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={saveProfile} disabled={savingProfile || uploadingAvatar} className="font-semibold">
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
                ? "bg-emerald-500/15 text-emerald-600"
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
            <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-600/90">
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

        {/* Change plan — automatic proration */}
        {isActive && user.hasCustomer && (
          <div className="mt-6 border-t border-border/50 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-primary">
                  <ArrowUpCircle className="size-4" />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold">Change your plan</h3>
                  <p className="text-xs text-muted-foreground">
                    Upgrades are prorated automatically — pay only the difference.
                  </p>
                </div>
              </div>

              {/* When to apply the change */}
              <div className="inline-flex rounded-xl border border-border/60 bg-background/40 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setApplyWhen("now")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors",
                    applyWhen === "now"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Zap className="size-3.5" /> Apply now
                </button>
                <button
                  type="button"
                  onClick={() => setApplyWhen("next_cycle")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors",
                    applyWhen === "next_cycle"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CalendarClock className="size-3.5" /> Next renewal
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {switchOptions.map((plan) => {
                const isUpgrade = plan.price > currentPrice;
                const busy = upgradingPrice === plan.priceId;
                return (
                  <div
                    key={plan.key}
                    className={cn(
                      "flex flex-col rounded-2xl border p-4 transition-colors",
                      plan.featured
                        ? "border-primary/50 bg-primary/[0.06]"
                        : "border-border/60 bg-background/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-sm font-bold">{plan.name}</p>
                        <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase",
                          isUpgrade
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {isUpgrade ? "Upgrade" : "Change"}
                      </span>
                    </div>

                    <p className="mt-2 tnum">
                      <span className="font-display text-xl font-bold">NZ${plan.price}</span>
                      <span className="text-xs text-muted-foreground"> / {plan.intervalLabel}</span>
                    </p>
                    <p className="tnum text-[0.7rem] font-medium text-muted-foreground/90">
                      {formatUsdApprox(plan.price, fx)} / {plan.intervalLabel} today
                    </p>

                    <ul className="mt-2 space-y-1">
                      <li className="flex items-center gap-1.5 text-[0.72rem] text-muted-foreground">
                        <Check className="size-3 text-emerald-600" />
                        {plan.tickerLimit} tickers · {plan.botAccess === "both" ? "both bots" : "one bot"}
                      </li>
                    </ul>

                    <Button
                      onClick={() => switchPlan(plan)}
                      disabled={busy || upgradingPrice !== null}
                      variant={plan.featured ? "default" : "outline"}
                      className="mt-3 w-full font-semibold"
                      size="sm"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" /> Updating…
                        </>
                      ) : isUpgrade ? (
                        `Upgrade to ${plan.name.replace("Apex ", "")}`
                      ) : (
                        `Switch to ${plan.name.replace("Apex ", "")}`
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-[0.7rem] text-muted-foreground">
              {applyWhen === "now"
                ? "Changes take effect immediately. Stripe calculates a prorated credit or charge against your current billing period."
                : "The new plan will begin at your next renewal date — no charge today."}
            </p>
          </div>
        )}
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
              <PasswordInput
                id="current-password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput
                id="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
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
