"use client";

import { useEffect, useState } from "react";
import { signIn, sendVerificationEmail } from "@/lib/auth-client";
import { waitForPostLoginSession } from "@/lib/auth-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandLogo } from "@/components/BrandLogo";
import { MailWarning, Loader2 } from "lucide-react";
import {
  clearLoginDraft,
  clearLoginPassword,
  failLoginDraft,
  readLoginDraft,
  subscribeLoginDraft,
  writeLoginDraft,
} from "@/lib/login-draft";
import { postLoginPath } from "@/lib/safe-redirect";

function redirectTarget(): string {
  if (typeof window === "undefined") return "/dashboard";
  return postLoginPath(new URLSearchParams(window.location.search).get("redirect"));
}

function LoginForm() {
  const [draft, setDraft] = useState(readLoginDraft);
  const [loading, setLoading] = useState(false);
  const [afterLogin, setAfterLogin] = useState("/dashboard");
  const email = draft.email;
  const password = draft.password;
  const error = draft.error;

  useEffect(() => subscribeLoginDraft(() => setDraft(readLoginDraft())), []);
  useEffect(() => {
    return () => clearLoginPassword();
  }, []);
  useEffect(() => setAfterLogin(redirectTarget()), []);
  // Set when login is blocked because the email isn't verified yet — we then
  // surface a dedicated panel with a "resend verification" action.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const typedEmail = email.trim();
    const typedPassword = password;
    if (!typedEmail || !typedPassword) {
      failLoginDraft(email, password, "Enter your email and password.");
      return;
    }
    writeLoginDraft({ error: "" });
    setNeedsVerification(false);
    setResendState("idle");
    setLoading(true);

    try {
      const result = await signIn.email({
        email: typedEmail,
        password: typedPassword,
      });

      // Check if login was successful
      if (!result || result.error) {
        const status = (result?.error as { status?: number } | undefined)?.status;
        const message = result?.error?.message || "";
        // Better Auth returns 403 (or a "not verified" message) when
        // requireEmailVerification blocks an unverified account. It also
        // automatically re-sends the verification email in that case.
        if (status === 403 || /verif/i.test(message)) {
          console.log(`[login] Blocked: ${typedEmail} has not verified their email yet.`);
          writeLoginDraft({ email: typedEmail, password: typedPassword, error: "" });
          setNeedsVerification(true);
          setResendState("sent");
        } else {
          failLoginDraft(typedEmail, typedPassword, message || "Error signing in. Please check your credentials.");
        }
        setLoading(false);
        return;
      }

      // Cookie must be readable before the dashboard document loads. A fixed
      // delay sometimes navigates first and the book paints signed-out.
      const ready = await waitForPostLoginSession();
      if (!ready) {
        failLoginDraft(typedEmail, typedPassword, "Signed in, but the session was not ready. Please try again.");
        setLoading(false);
        return;
      }
      clearLoginDraft();
      window.location.href = redirectTarget();
    } catch (err: unknown) {
      console.error("Login error:", err);
      const message = err instanceof Error ? err.message : "";
      failLoginDraft(typedEmail, typedPassword, message || "Error signing in. Please check your credentials.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResendState("sending");
    try {
      const res = await sendVerificationEmail({ email, callbackURL: "/verify-email" });
      if ((res as any)?.error) throw new Error((res as any).error.message || "Failed to resend");
      setResendState("sent");
      console.log(`[login] Verification email re-sent to ${email}`);
    } catch (err) {
      console.error("[login] Resend verification failed:", err);
      setResendState("error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-br from-background to-muted/20">
      <h1 className="sr-only">Sign in</h1>
      <Link href="/" className="transition-opacity hover:opacity-90">
        <BrandLogo animated markClassName="size-12" wordmarkClassName="text-xl" />
      </Link>
      <Card className="w-full max-w-md shadow-xl border-2">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-3xl font-bold tracking-tight">Welcome Back</CardTitle>
          <CardDescription className="text-base">
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {needsVerification && (
              <Alert className="border-amber-500/40 bg-amber-500/10 animate-in fade-in slide-in-from-top-2">
                <MailWarning className="size-4 text-amber-500" />
                <AlertDescription className="space-y-3">
                  <p className="text-sm text-foreground">
                    Please verify your email before signing in. We&apos;ve sent a fresh verification
                    link to <span className="font-semibold">{email}</span> — check your inbox (and spam folder).
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={handleResend}
                    disabled={resendState === "sending"}
                  >
                    {resendState === "sending" ? (
                      <><Loader2 className="size-3.5 animate-spin" /> Sending…</>
                    ) : resendState === "sent" ? (
                      "Resend link again"
                    ) : resendState === "error" ? (
                      "Try resending again"
                    ) : (
                      "Resend verification email"
                    )}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => writeLoginDraft({ email: e.target.value })}
                required
                className="h-11 transition-all focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-primary hover:underline transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordInput
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => writeLoginDraft({ password: e.target.value })}
                required
                autoComplete="current-password"
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
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href={afterLogin === "/dashboard" ? "/register" : `/register?redirect=${encodeURIComponent(afterLogin)}`} className="font-semibold text-primary hover:underline transition-colors">
                Sign up here
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}