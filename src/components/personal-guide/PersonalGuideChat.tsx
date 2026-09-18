"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  HelpCircle,
  LineChart,
  Loader2,
  Rocket,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { PERSONAL_GUIDE_SIGNUP_URL } from "@/lib/personal-guide-knowledge";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

type EntryCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  /** If set, card navigates to signup instead of chatting. */
  href?: string;
  /** Prompt sent to the Help Assistant when the card is clicked. */
  prompt?: string;
  primary?: boolean;
};

const ENTRY_CARDS: EntryCard[] = [
  {
    id: "start-free",
    title: "Get Started Now Free",
    subtitle: "Create your free account in minutes",
    icon: Rocket,
    href: PERSONAL_GUIDE_SIGNUP_URL,
    primary: true,
  },
  {
    id: "how-works",
    title: "Don't understand how AetherForgeAI works?",
    subtitle: "A clear walkthrough of the site",
    icon: HelpCircle,
    prompt: "I don't understand how AetherForgeAI works. Please explain it simply and professionally.",
  },
  {
    id: "buy-assets",
    title: "Unsure of how to buy stocks or crypto?",
    subtitle: "Educational overview, then track in AetherForge",
    icon: LineChart,
    prompt: "I'm unsure how to buy stocks or crypto. Please explain the basics simply, then how AetherForge helps me track holdings.",
  },
  {
    id: "bots",
    title: "What do Stox, Koins and The Headmaster do?",
    subtitle: "Meet the AI bots in plain language",
    icon: Bot,
    prompt: "What do Stox, Koins and The Headmaster do? Keep it simple and professional.",
  },
  {
    id: "maximize",
    title: "How do I get the most from the free plan?",
    subtitle: "Practical first steps after signup",
    icon: Sparkles,
    prompt: "How do I get the most from the free plan? Give me clear first steps.",
  },
];

const WELCOME =
  "Welcome — I'm your **Help Assistant**. Choose a card below, or type a question.";

export function PersonalGuideChat({
  onDismiss,
  showSeatedCharacter = true,
}: {
  onDismiss: () => void;
  /** When false, the window is visible but the avatar hasn't landed yet. */
  showSeatedCharacter?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showCards, setShowCards] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending, showCards]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setShowCards(false);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setSending(true);

    try {
      const res = await fetch("/api/personal-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: messages.slice(-8).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 2000),
          })),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { reply?: string };
        error?: string;
      };
      if (json.ok && json.data?.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: json.data!.reply! },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry — I hiccuped there. Try again, or [start free](" +
              PERSONAL_GUIDE_SIGNUP_URL +
              ") while I catch my breath.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I couldn't reach the forge just now. You can still [start free](" +
            PERSONAL_GUIDE_SIGNUP_URL +
            ") — I'll be right here when you're back.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="pg-chat-in fixed bottom-4 left-3 z-[70] flex w-[min(100%-1.5rem,22rem)] flex-col overflow-visible rounded-2xl border border-amber-400/40 bg-[#06261a]/95 shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-md sm:left-4"
      style={{ height: "50vh", maxHeight: "28rem" }}
      role="dialog"
      aria-label="Help Assistant chat"
    >
      <div className="relative overflow-visible rounded-t-2xl border-b border-amber-400/30 bg-gradient-to-r from-[#0a3d2a] via-[#0f4f35] to-[#0a3d2a] px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2 top-2 z-10 rounded-md p-1 text-amber-100/70 hover:bg-white/10 hover:text-amber-50"
          aria-label="Dismiss Help Assistant"
        >
          <X className="size-4" />
        </button>
        <div className="flex items-end gap-2 pr-8">
          {showSeatedCharacter ? (
            <img
              src="/brand/bot-personal-guide.svg"
              alt=""
              className="pg-seat relative -mb-6 -mt-10 h-20 w-auto shrink-0 drop-shadow-[0_8px_12px_rgba(0,0,0,0.5)] sm:h-24"
            />
          ) : (
            <div className="relative -mb-6 -mt-10 h-20 w-14 shrink-0 sm:h-24" />
          )}
          <div className="min-w-0 pb-1">
            <p className="font-display text-sm font-bold tracking-wide text-amber-300">
              Help Assistant
            </p>
            <p className="truncate text-[11px] text-emerald-100/70">
              Professional site help · not financial advice
            </p>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-b-2xl px-3 py-3"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-amber-400 text-amber-950"
                  : "border border-amber-400/25 bg-[#0c3a28] text-emerald-50"
              )}
            >
              {m.role === "assistant" ? (
                <Markdown
                  content={m.content}
                  className="prose-invert text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-amber-300"
                />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}

        {showCards && messages.length <= 1 && !sending ? (
          <div className="grid gap-2 pt-0.5">
            {ENTRY_CARDS.map((card) => {
              const Icon = card.icon;
              const className = cn(
                "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                card.primary
                  ? "border-amber-400/55 bg-amber-400/15 hover:bg-amber-400/25"
                  : "border-amber-400/25 bg-[#0c3a28]/80 hover:border-amber-400/45 hover:bg-[#0f4f35]/70"
              );
              const inner = (
                <>
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                      card.primary
                        ? "bg-amber-400 text-amber-950"
                        : "bg-amber-400/15 text-amber-300"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-snug text-amber-50">
                      {card.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-emerald-100/65">
                      {card.subtitle}
                    </span>
                  </span>
                </>
              );
              if (card.href) {
                return (
                  <Link key={card.id} href={card.href} className={className}>
                    {inner}
                  </Link>
                );
              }
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => card.prompt && send(card.prompt)}
                  className={className}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        ) : null}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-emerald-100/70">
            <Loader2 className="size-3.5 animate-spin text-amber-300" />
            Help Assistant is thinking…
          </div>
        )}
      </div>

      <div className="rounded-b-2xl border-t border-amber-400/25 bg-[#041f16] p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-1.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Or type a question…"
            className="h-9 flex-1 rounded-xl border border-amber-400/25 bg-[#0a2f22] px-3 text-sm text-emerald-50 placeholder:text-emerald-100/40 focus:border-amber-400/50 focus:outline-none"
            maxLength={1500}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="grid size-9 place-items-center rounded-xl bg-amber-400 text-amber-950 disabled:opacity-40"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </form>
        <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
          <p className="text-[10px] text-emerald-100/50">Educational only · not advice</p>
          <Link
            href={PERSONAL_GUIDE_SIGNUP_URL}
            className="text-[10px] font-semibold text-amber-300 hover:underline"
          >
            Start free →
          </Link>
        </div>
      </div>
    </div>
  );
}
