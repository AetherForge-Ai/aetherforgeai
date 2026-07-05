"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckCircle2, AlertTriangle } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  // Better Auth redirects here with ?error=INVALID_TOKEN when the link is bad/expired.
  const linkError = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const invalidLink = !!linkError || !token;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      console.log("[reset-password] Submitting new password");
      const result = await resetPassword({ token, newPassword: password });

      if (result.error) {
        console.error("[reset-password] Error:", result.error.message);
        setError(result.error.message || "This reset link is invalid or has expired. Please request a new one.");
        setLoading(false);
        return;
      }

      console.log("[reset-password] Password reset successful");
      setDone(true);
      setLoading(false);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err: any) {
      console.error("[reset-password] Unexpected error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gradient-to-br from-background to-muted/20">
      <Link href="/" className="transition-opacity hover:opacity-90">
        <BrandLogo animated markClassName="size-12" wordmarkClassName="text-xl" />
      </Link>
      <Card className="w-full max-w-md shadow-xl border-2">
        {done ? (
          <>
            <CardHeader className="space-y-3 text-center pb-6">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <CheckCircle2 className="size-7" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Password updated</CardTitle>
              <CardDescription className="text-base">
                Your password has been reset. Redirecting you to sign in...
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-2">
              <Button asChild className="w-full h-11 text-base font-semibold">
                <Link href="/login">Go to Sign In</Link>
              </Button>
            </CardFooter>
          </>
        ) : invalidLink ? (
          <>
            <CardHeader className="space-y-3 text-center pb-6">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-7" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Invalid or expired link</CardTitle>
              <CardDescription className="text-base">
                This password reset link is no longer valid. Reset links expire after 1 hour — please request a new one.
              </CardDescription>
            </CardHeader>
            <CardFooter className="pt-2">
              <Button asChild className="w-full h-11 text-base font-semibold">
                <Link href="/forgot-password">Request a New Link</Link>
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader className="space-y-2 text-center pb-6">
              <CardTitle className="text-3xl font-bold tracking-tight">Set a new password</CardTitle>
              <CardDescription className="text-base">
                Choose a strong password you haven&apos;t used before.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5">
                {error && (
                  <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 transition-all focus:ring-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-sm font-semibold">Confirm New Password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
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
                  {loading ? "Updating..." : "Reset Password"}
                </Button>
                <Link
                  href="/login"
                  className="text-sm font-semibold text-primary hover:underline transition-colors"
                >
                  Back to sign in
                </Link>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background to-muted/20">
        <Card className="w-full max-w-md shadow-xl border-2">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight">Set a new password</CardTitle>
            <CardDescription className="text-base">Loading...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
