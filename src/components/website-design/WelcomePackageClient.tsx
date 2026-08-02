"use client";

import { useState } from "react";
import {
  WELCOME_LETTER_TEMPLATE,
  WELCOME_EMAIL_TEMPLATE,
} from "@/lib/website-design-content";
import { Check, Copy, FileText, Mail, Lock, ArrowLeft } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Copy-ready onboarding resource card (owner-only)                           */
/* -------------------------------------------------------------------------- */

function ResourceCard({
  icon: Icon,
  title,
  description,
  content,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  content: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      console.log(`[WelcomePackage] Copied "${title}" to clipboard`);
    } catch (err) {
      console.error("[WelcomePackage] Clipboard copy failed:", err);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-[1.4rem] border border-[#E6D9C4] bg-[#FFFDF9] p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#C8A96A]/15 text-[#9A7B44]">
            <Icon className="size-5" />
          </span>
          <div>
            <h3
              className="text-xl text-[#211E1B]"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              {title}
            </h3>
            <p className="text-xs font-light text-[#8A7E6E]">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#CDBEA3] px-3.5 py-2 text-xs font-medium text-[#4A4237] transition-colors hover:border-[#9A7B44] hover:text-[#9A7B44]"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="mt-5 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-[#EFE4D2] bg-[#FBF6EE] p-4 text-[13px] font-light leading-relaxed text-[#4A4237]"
        style={{ fontFamily: "var(--font-studio-sans), ui-sans-serif, system-ui, sans-serif" }}
      >
        {content}
      </pre>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export function WelcomePackageClient() {
  return (
    <main
      className="min-h-screen bg-[#F7F1E8] text-[#2B2724] antialiased selection:bg-[#C8A96A]/30"
      style={{ fontFamily: "var(--font-studio-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <a
          href="/website-design"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#6B6152] transition-colors hover:text-[#9A7B44]"
        >
          <ArrowLeft className="size-4" /> Back to the Website Design page
        </a>

        <div className="mt-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#C8A96A]/15 text-[#9A7B44]">
            <Lock className="size-5" />
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
            Private · Owner only
          </span>
        </div>

        <h1
          className="mt-4 max-w-3xl text-4xl leading-tight text-[#211E1B] sm:text-5xl"
          style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
        >
          Your Welcome Package.
        </h1>
        <p className="mt-5 max-w-2xl text-lg font-light leading-relaxed text-[#5C5346]">
          These are your copy-ready onboarding documents — kept private and never shown to enquiring
          visitors. The full Welcome Email below is sent automatically to a client the moment they
          pay through a Stripe payment link. You can also copy either document here whenever you want
          to send it manually.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <ResourceCard
            icon={FileText}
            title="Formal Welcome Letter"
            description="The letter that goes inside the welcome email"
            content={WELCOME_LETTER_TEMPLATE}
          />
          <ResourceCard
            icon={Mail}
            title="Full Welcome Email"
            description="Complete email, with the formal letter inside — sent automatically after payment"
            content={WELCOME_EMAIL_TEMPLATE}
          />
        </div>
      </div>
    </main>
  );
}
