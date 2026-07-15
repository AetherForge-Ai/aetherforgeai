"use client";

import { useEffect, useState } from "react";
import { signUp, sendVerificationEmail } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandLogo } from "@/components/BrandLogo";
import { MailCheck, ShieldCheck, Loader2, Inbox } from "lucide-react";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // After a successful sign-up we DON'T redirect — email verification is required
  // before any session is granted. We flip to a "check your email" confirmation.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // Prefill the email when arriving from the pricing free-trial CTA (?email=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presetEmail = params.get("email");
    if (presetEmail) {
      setFormData((prev) => ({ ...prev, email: presetEmail }));
    }
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      const result = await signUp.email({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        // Where Better Auth sends the browser after the verification link is clicked.
        callbackURL: "/verify-email",
      });

      if (result.error) {
        console.error("[register] Sign-up error:", result.error);
        setError(result.error.message || "Error registering. The email might already be in use.");
        setLoading(false);
        return;
      }

      // Email verification is REQUIRED before access — no session is created yet.
      // Show the "check your email" confirmation instead of routing to the dashboard.
      console.log(`[register] Account created for ${formData.email} — verification email dispatched.`);
      setRegisteredEmail(formData.email);
      setLoading(false);
    } catch (err: any) {
      console.error("[register] Registration error:", err);
      setError(err.message || "Error registering. The email might already be in use.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setResendState("sending");
    try {
      const res = await sendVerificationEmail({ email: registeredEmail, callbackURL: "/verify-email" });
      if ((res as any)?.error) throw new Error((res as any).error.message || "Failed to resend");
      setResendState("sent");
      console.log(`[register] Verification email re-sent to ${registeredEmail}`);
    } catch (err) {
      console.error("[register] Resend verification failed:", err);
      setResendState("error");
    }
  };

  // -------------------------------------------------------------------------
  // Confirmation screen — shown after a successful sign-up.
  // -------------------------------------------------------------------------
  if (registeredEmail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-br from-background to-muted/20">
        <Link href="/" className="transition-opacity hover:opacity-90">
          <BrandLogo animated markClassName="size-12" wordmarkClassName="text-xl" />
        </Link>
        <Card className="w-full max-w-md border shadow-xl">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <MailCheck className="size-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
            <CardDescription className="text-base">
              We&apos;ve sent a verification link to
              <br />
              <span className="font-semibold text-foreground break-all">{registeredEmail}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
              <p className="flex items-start gap-2">
                <Inbox className="size-4 mt-0.5 shrink-0 text-primary" />
                <span>Open the email and click <span className="font-semibold text-foreground">Verify My Email</span> to activate your account and unlock your dashboard.</span>
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="size-4 mt-0.5 shrink-0 text-primary" />
                <span>Can&apos;t find it? Check your <span className="font-semibold text-foreground">spam or promotions</span> folder — it can take a minute to arrive.</span>
              </p>
            </div>

            {resendState === "sent" && (
              <Alert className="border-primary/30 bg-primary/5">
                <AlertDescription className="text-primary">
                  A fresh verification email is on its way.
                </AlertDescription>
              </Alert>
            )}
            {resendState === "error" && (
              <Alert variant="destructive">
                <AlertDescription>Couldn&apos;t resend right now. Please try again in a moment.</AlertDescription>
              </Alert>
            )}

            <Button
              variant="outline"
              className="w-full h-11"
              onClick={handleResend}
              disabled={resendState === "sending" || resendState === "sent"}
            >
              {resendState === "sending" ? (
                <><Loader2 className="size-4 animate-spin" /> Resending…</>
              ) : resendState === "sent" ? (
                "Email resent ✓"
              ) : (
                "Resend verification email"
              )}
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button asChild className="w-full h-11 text-base font-semibold">
              <Link href="/login">Go to Log In</Link>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Once verified, you can log in and access everything.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Sign-up form.
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-br from-background to-muted/20">
      <Link href="/" className="transition-opacity hover:opacity-90">
        <BrandLogo animated markClassName="size-12" wordmarkClassName="text-xl" />
      </Link>
      <Card className="w-full max-w-md shadow-xl border-2">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-3xl font-bold tracking-tight">Create Account</CardTitle>
          <CardDescription className="text-base">
            Enter your information to get started
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="h-11 transition-all focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-semibold">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="h-11 transition-all focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                className="h-11 transition-all focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-semibold">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                minLength={6}
                className="h-11 transition-all focus:ring-2"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-4">
            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold transition-all hover:scale-[1.02]"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              We&apos;ll email you a verification link to activate your account.
            </p>
            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline transition-colors">
                Sign in here
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
