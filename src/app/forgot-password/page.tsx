"use client";

import { useState } from "react";
import { forgetPassword } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandLogo } from "@/components/BrandLogo";
import { MailCheck, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      console.log("[forgot-password] Requesting reset link for", email);
      const result = await forgetPassword({
        email,
        redirectTo: "/reset-password",
      });

      if (result.error) {
        // Better Auth returns success even for unknown emails to avoid account
        // enumeration; only surface a real transport error here.
        console.error("[forgot-password] Error:", result.error.message);
        setError(result.error.message || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      console.log("[forgot-password] Reset link request accepted");
      setSent(true);
      setLoading(false);
    } catch (err: any) {
      console.error("[forgot-password] Unexpected error:", err);
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
        {sent ? (
          <>
            <CardHeader className="space-y-3 text-center pb-6">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MailCheck className="size-7" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
              <CardDescription className="text-base">
                If an account exists for <span className="font-semibold text-foreground">{email}</span>, we&apos;ve
                sent a password reset link. It expires in 1 hour.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-col space-y-4 pt-2">
              <p className="text-sm text-center text-muted-foreground">
                Didn&apos;t get it? Check your spam folder, or{" "}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="font-semibold text-primary hover:underline transition-colors"
                >
                  try another email
                </button>
                .
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline transition-colors"
              >
                <ArrowLeft className="size-4" /> Back to sign in
              </Link>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader className="space-y-2 text-center pb-6">
              <CardTitle className="text-3xl font-bold tracking-tight">Forgot password?</CardTitle>
              <CardDescription className="text-base">
                Enter your email and we&apos;ll send you a secure link to reset it.
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
                  <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
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
                  {loading ? "Sending link..." : "Send Reset Link"}
                </Button>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline transition-colors"
                >
                  <ArrowLeft className="size-4" /> Back to sign in
                </Link>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
