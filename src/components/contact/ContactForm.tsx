"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Public contact form. Posts to /api/contact, which is rate-limited per network
 * (CONTACT_LIMIT per CONTACT_WINDOW_MS) and has a hidden honeypot field.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setState("error");
        setError(body.error || "Your message was not sent. Please try again or email us.");
        return;
      }
      setState("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setState("error");
      setError("Your message was not sent. Please try again or email us.");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        Thanks. Your message has been sent and we will reply by email.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Contact form" data-contact-form>
      <div className="space-y-1.5">
        <Label htmlFor="contact-name">Name</Label>
        <Input id="contact-name" name="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-email">Email</Label>
        <Input id="contact-email" name="email" type="email" required maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-message">Message</Label>
        <textarea
          id="contact-message"
          name="message"
          required
          maxLength={2000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {state === "error" ? (
        <p role="alert" className="text-sm text-rose-500">{error}</p>
      ) : null}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
