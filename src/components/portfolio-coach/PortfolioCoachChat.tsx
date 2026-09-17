"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  FileText,
  Loader2,
  Minimize2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";
import { BOT_HEADMASTER_AVATAR } from "@/assets/files";

type Msg = { role: "user" | "assistant"; content: string };

type ReportItem = {
  _id: string;
  title: string;
  bot: "stock" | "crypto" | string;
  executiveSummary?: string;
  generatedAt?: string;
  pdfUrl?: string | null;
};

const SUGGESTIONS = [
  "What is my next execution step?",
  "How do I buy / add a holding?",
  "How do I set a share-price alert?",
  "Explain NZX vs ASX simply",
];

const WELCOME =
  "Hello — I am your **Portfolio Execution Coach**.\n\n" +
  "I help you turn **The Headmaster** plans and **Stox / Koins** reports into clear dashboard steps: cash, buys, sells, alerts and transactions.\n\n" +
  "Open the paperclip to attach a recent report, or ask for the next step.\n\n" +
  "_Educational / execution help — not personalised financial advice._";

function botLabel(bot?: string) {
  if (bot === "crypto") return "Koins";
  if (bot === "stock") return "Stox";
  return "Report";
}

export function PortfolioCoachChat({
  onMinimize,
}: {
  onMinimize: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [headmasterPlan, setHeadmasterPlan] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedReports = useMemo(
    () => reports.filter((r) => selectedIds.includes(r._id)),
    [reports, selectedIds]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending, attachOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Prefetch live book snapshot for optional client context.
        // Full Headmaster grounding is also loaded server-side in /api/portfolio-coach.
        const res = await fetch("/api/totalum", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: {
            synthesis?: {
              asOf?: string;
              totalValueNZD?: number;
              cashBalanceNZD?: number;
              diversificationScore?: number;
              concentrationLabel?: string;
              classAllocation?: { label: string; weight: number }[];
              isEmpty?: boolean;
            };
          };
        };
        if (cancelled || !json.ok || !json.data?.synthesis) return;
        const s = json.data.synthesis;
        if (s.isEmpty) {
          setHeadmasterPlan(
            "Headmaster snapshot: book is empty. Guide the member to deposit cash and add holdings first."
          );
          return;
        }
        const alloc = (s.classAllocation || [])
          .slice(0, 6)
          .map((c) => `${c.label} ${c.weight.toFixed(0)}%`)
          .join(" · ");
        const bits = [
          `Latest Headmaster book value about NZ$${Math.round(s.totalValueNZD || 0).toLocaleString()}` +
            (s.asOf ? ` (as of ${s.asOf})` : "") +
            ".",
          `Cash about NZ$${Math.round(s.cashBalanceNZD || 0).toLocaleString()}.`,
          s.diversificationScore != null
            ? `Diversification ${s.diversificationScore}/100 (${s.concentrationLabel || "n/a"}).`
            : "",
          alloc ? `Allocation: ${alloc}.` : "",
        ].filter(Boolean);
        setHeadmasterPlan(bits.join("\n"));
      } catch {
        /* Headmaster may be locked — coach still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadReports() {
    setReportsLoading(true);
    try {
      const res = await fetch("/api/reports", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { reports?: ReportItem[] };
      };
      if (json.ok && json.data?.reports) {
        setReports(
          json.data.reports.filter(
            (r) => r.bot === "stock" || r.bot === "crypto"
          )
        );
      }
    } catch {
      /* ignore */
    } finally {
      setReportsLoading(false);
    }
  }

  function toggleAttachPanel() {
    const next = !attachOpen;
    setAttachOpen(next);
    if (next && reports.length === 0) void loadReports();
  }

  function toggleReport(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setSending(true);
    setAttachOpen(false);

    try {
      const res = await fetch("/api/portfolio-coach", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: messages.slice(-8).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 2000),
          })),
          headmasterPlan: headmasterPlan || undefined,
          attachedReports: selectedReports.map((r) => ({
            id: r._id,
            title: r.title,
            bot: r.bot === "crypto" ? "crypto" : "stock",
            summary: (r.executiveSummary || "").slice(0, 5000),
            generatedAt: r.generatedAt,
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
              "Sorry — I could not complete that reply. Please try again in a moment.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I could not reach the coach service just now. Please try again shortly.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="pg-chat-in fixed bottom-4 right-3 z-[70] flex w-[min(100%-1.5rem,24rem)] flex-col overflow-hidden rounded-2xl border border-amber-400/40 bg-[#06261a]/96 shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_22px_56px_rgba(0,0,0,0.55)] backdrop-blur-md sm:right-5"
      style={{ height: "min(70vh, 34rem)" }}
      role="dialog"
      aria-label="Portfolio Execution Coach"
    >
      {/* Header */}
      <div className="relative shrink-0 border-b border-amber-400/30 bg-gradient-to-r from-[#0a3d2a] via-[#0f4f35] to-[#0a3d2a] px-3 pb-3 pt-3">
        <div className="absolute right-2 top-2 flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMinimize}
            className="rounded-md p-1.5 text-amber-100/70 hover:bg-white/10 hover:text-amber-50"
            aria-label="Minimize Portfolio Coach"
          >
            <Minimize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="rounded-md p-1.5 text-amber-100/70 hover:bg-white/10 hover:text-amber-50"
            aria-label="Close Portfolio Coach"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 pr-16">
          <img
            src={BOT_HEADMASTER_AVATAR}
            alt=""
            className="size-11 shrink-0 rounded-full border border-amber-400/35 object-cover shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
          />
          <div className="min-w-0">
            <p className="font-display text-sm font-bold tracking-wide text-amber-300">
              Portfolio Coach
            </p>
            <p className="truncate text-[11px] text-emerald-100/70">
              Execute plans · align your dashboard
            </p>
          </div>
        </div>

        {selectedReports.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {selectedReports.map((r) => (
              <span
                key={r._id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-100"
              >
                <FileText className="size-3 shrink-0 opacity-80" />
                <span className="truncate">
                  {botLabel(r.bot)} · {r.title}
                </span>
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 hover:bg-white/10"
                  aria-label={`Detach ${r.title}`}
                  onClick={() => toggleReport(r._id)}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start"
            )}
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
                  className="prose-invert text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-amber-300 [&_ol]:my-2 [&_ul]:my-2"
                />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-emerald-100/70">
            <Loader2 className="size-3.5 animate-spin text-amber-300" />
            Portfolio Coach is preparing the next steps…
          </div>
        )}

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-100 hover:bg-amber-400/20"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {attachOpen && (
          <div className="rounded-xl border border-amber-400/25 bg-[#041f16]/90 p-2.5 shadow-inner">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-amber-200">
                Attach Stox / Koins reports
              </p>
              <button
                type="button"
                onClick={() => setAttachOpen(false)}
                className="rounded p-0.5 text-emerald-100/60 hover:text-amber-100"
                aria-label="Close attach panel"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-emerald-100/55">
              Select up to three recent reports. Their summaries are sent with your next message.
            </p>
            {reportsLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-emerald-100/70">
                <Loader2 className="size-3.5 animate-spin text-amber-300" />
                Loading reports…
              </div>
            ) : reports.length === 0 ? (
              <p className="py-2 text-[11px] text-emerald-100/65">
                No Stox or Koins reports yet. Run one from the{" "}
                <Link href="/dashboard" className="text-amber-300 hover:underline">
                  Report Center
                </Link>
                .
              </p>
            ) : (
              <ul className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
                {reports.slice(0, 12).map((r) => {
                  const on = selectedIds.includes(r._id);
                  return (
                    <li key={r._id}>
                      <button
                        type="button"
                        onClick={() => toggleReport(r._id)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition",
                          on
                            ? "border-amber-400/50 bg-amber-400/15"
                            : "border-amber-400/15 bg-[#0a2f22]/80 hover:border-amber-400/35"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-3.5 shrink-0 place-items-center rounded border text-[9px]",
                            on
                              ? "border-amber-300 bg-amber-400 text-amber-950"
                              : "border-amber-400/40 text-transparent"
                          )}
                        >
                          ✓
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-medium text-amber-100">
                            {botLabel(r.bot)} · {r.title}
                          </span>
                          {r.generatedAt && (
                            <span className="block truncate text-[10px] text-emerald-100/50">
                              {new Date(r.generatedAt).toLocaleString()}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-amber-400/25 bg-[#041f16] p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-1.5"
        >
          <button
            type="button"
            onClick={toggleAttachPanel}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl border transition",
              attachOpen || selectedIds.length
                ? "border-amber-400/50 bg-amber-400/20 text-amber-200"
                : "border-amber-400/25 bg-[#0a2f22] text-amber-100/80 hover:border-amber-400/45"
            )}
            aria-label="Attach Stox or Koins reports"
            title="Attach reports"
          >
            <Paperclip className="size-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for the next dashboard step…"
            className="h-9 flex-1 rounded-xl border border-amber-400/25 bg-[#0a2f22] px-3 text-sm text-emerald-50 placeholder:text-emerald-100/40 focus:border-amber-400/50 focus:outline-none"
            maxLength={2000}
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
          <p className="text-[10px] text-emerald-100/50">
            Educational only · not advice
          </p>
          <Link
            href="/headmaster"
            className="text-[10px] font-semibold text-amber-300 hover:underline"
          >
            Open Headmaster →
          </Link>
        </div>
      </div>
    </div>
  );
}
