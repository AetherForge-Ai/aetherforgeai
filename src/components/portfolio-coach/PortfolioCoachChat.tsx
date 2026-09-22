"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Compass,
  FileText,
  LayoutDashboard,
  Loader2,
  Minimize2,
  Paperclip,
  PieChart,
  Send,
  Sparkles,
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

type BookSnapshot = {
  asOf?: string;
  totalValueNZD?: number;
  cashBalanceNZD?: number;
  diversificationScore?: number;
  concentrationLabel?: string;
  classAllocation?: { label: string; weight: number; valueNZD?: number }[];
  isEmpty?: boolean;
};

type EntryCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  /** If set, card navigates instead of chatting. */
  href?: string;
  /** Prompt sent to the Assistant Guide when the card is clicked. */
  prompt?: string;
  /** Build overview from live book snapshot when available. */
  kind?: "overview" | "chat" | "navigate";
};

const ENTRY_CARDS: EntryCard[] = [
  {
    id: "portfolio-overview",
    title: "Is Your Portfolio looking how it should?",
    subtitle: "Dashboard overview — cash, totals, stocks, crypto, metals",
    icon: LayoutDashboard,
    kind: "overview",
    prompt:
      "Is my portfolio looking how it should? Please give a clear Dashboard Overview of cash, totals, stocks, crypto and metals, using my current book context.",
  },
  {
    id: "portfolio-shape",
    title: "Your Current Portfolio Shape",
    subtitle: "Sectors and asset mix vs The Headmaster plan",
    icon: PieChart,
    kind: "chat",
    prompt:
      "Show my current portfolio shape — sectors and asset mix — and compare it to The Headmaster plan/strategy. Use Headmaster context when available.",
  },
  {
    id: "run-stox-koins",
    title: "Run Stox or Koins",
    subtitle: "Open Report Center to generate AI bot reports",
    icon: Sparkles,
    kind: "navigate",
    href: "/dashboard#report-center",
  },
  {
    id: "match-headmaster",
    title: "Match The Headmaster strategy",
    subtitle: "Walk through alignment moves · advisory only",
    icon: Compass,
    kind: "chat",
    prompt:
      "Help me match The Headmaster strategy. Walk me through the moves to align my portfolio with that plan, and how to tweak Stox/Koins report suggestions on the dashboard. Keep it advisory — recommendations are not fills, and AetherForge does not place trades.",
  },
];

const WELCOME =
  "Welcome — I'm your **Assistant Guide**. Choose a card below, or type a question.";

const CHAT_KEY_PREFIX = "af-portfolio-coach-chat-v1:";
const REPORT_CENTER_HREF = "/dashboard#report-center";

function chatStorageKey(userId: string) {
  return CHAT_KEY_PREFIX + userId;
}

function loadMessages(userId: string): { messages: Msg[]; showCards: boolean } {
  const welcome: Msg[] = [{ role: "assistant", content: WELCOME }];
  try {
    const raw = localStorage.getItem(chatStorageKey(userId));
    if (!raw) return { messages: welcome, showCards: true };
    const parsed = JSON.parse(raw) as Msg[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { messages: welcome, showCards: true };
    }
    const filtered = parsed.filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    );
    if (filtered.length === 0) return { messages: welcome, showCards: true };
    // Fresh / welcome-only thread → show entry cards (refresh welcome copy).
    if (filtered.length === 1 && filtered[0].role === "assistant") {
      return { messages: welcome, showCards: true };
    }
    return { messages: filtered, showCards: false };
  } catch {
    return { messages: welcome, showCards: true };
  }
}

function saveMessages(userId: string, messages: Msg[]) {
  try {
    const trimmed = messages.slice(-80);
    localStorage.setItem(chatStorageKey(userId), JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
}

function botLabel(bot?: string) {
  if (bot === "crypto") return "Koins";
  if (bot === "stock") return "Stox";
  return "Report";
}

function nzd(v: number | undefined | null): string {
  if (v == null || Number.isNaN(Number(v))) return "NZ$…";
  return `NZ$${Math.round(Number(v)).toLocaleString()}`;
}

function formatBookSnapshot(s: BookSnapshot): string {
  if (s.isEmpty) {
    return (
      "**Dashboard overview**\n\n" +
      "I could not see cash or holdings on your live ledger yet.\n\n" +
      "If you recently deposited funds, refresh and ask again — I always re-read the ledger before making cash claims."
    );
  }
  const alloc = (s.classAllocation || [])
    .slice(0, 8)
    .map((c) => {
      const value =
        c.valueNZD != null ? ` · ${nzd(c.valueNZD)}` : "";
      return `- **${c.label}**: ${c.weight.toFixed(0)}%${value}`;
    })
    .join("\n");

  const bits = [
    "**Dashboard overview**" +
      (s.asOf ? ` _(as of ${s.asOf})_` : ""),
    "",
    `- **Total value:** ${nzd(s.totalValueNZD)}`,
    `- **Cash:** ${nzd(s.cashBalanceNZD)}`,
  ];
  if (s.diversificationScore != null) {
    bits.push(
      `- **Diversification:** ${s.diversificationScore}/100` +
        (s.concentrationLabel ? ` (${s.concentrationLabel})` : "")
    );
  }
  if (alloc) {
    bits.push("", "**Asset mix**", alloc);
  }
  bits.push(
    "",
    "_Snapshot from your live book. Educational / execution help — not personalised financial advice._"
  );
  return bits.join("\n");
}

export function PortfolioCoachChat({
  onMinimize,
  userId,
}: {
  onMinimize: () => void;
  /** Stable per-member key so chat history follows across the site. */
  userId: string;
}) {
  const initial = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        messages: [{ role: "assistant" as const, content: WELCOME }],
        showCards: true,
      };
    }
    return loadMessages(userId);
  }, [userId]);

  const [messages, setMessages] = useState<Msg[]>(() => initial.messages);
  const [showCards, setShowCards] = useState(() => initial.showCards);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [headmasterPlan, setHeadmasterPlan] = useState<string>("");
  const [bookSnapshot, setBookSnapshot] = useState<BookSnapshot | null>(null);
  const [bookLoading, setBookLoading] = useState(true);
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
  }, [messages, sending, attachOpen, showCards]);

  useEffect(() => {
    saveMessages(userId, messages);
  }, [userId, messages]);

  useEffect(() => {
    const loaded = loadMessages(userId);
    setMessages(loaded.messages);
    setShowCards(loaded.showCards);
    setSelectedIds([]);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setBookLoading(true);

    function applySynthesis(s: BookSnapshot) {
      setBookSnapshot(s);
      setBookLoading(false);
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
        `Latest Headmaster book value about ${nzd(s.totalValueNZD)}` +
          (s.asOf ? ` (as of ${s.asOf})` : "") +
          ".",
        `Cash about ${nzd(s.cashBalanceNZD)}.`,
        s.diversificationScore != null
          ? `Diversification ${s.diversificationScore}/100 (${s.concentrationLabel || "n/a"}).`
          : "",
        alloc ? `Allocation: ${alloc}.` : "",
      ].filter(Boolean);
      setHeadmasterPlan(bits.join("\n"));
    }

    async function loadLedgerFallback() {
      try {
        const [stocksRes, txRes, metalsRes] = await Promise.all([
          fetch("/api/stocks", { credentials: "include" }),
          fetch("/api/transactions", { credentials: "include" }),
          fetch("/api/metals", { credentials: "include" }),
        ]);
        const stocksJson = (await stocksRes.json()) as {
          ok?: boolean;
          data?: {
            asset_type?: string;
            current_value?: number;
            market_value?: number;
            value_nzd?: number;
            quantity?: number;
            current_price?: number;
            price?: number;
          }[];
        };
        const txJson = (await txRes.json()) as {
          ok?: boolean;
          data?: { cashBalance?: number };
        };
        const metalsJson = (await metalsRes.json()) as {
          ok?: boolean;
          data?: {
            metals?: {
              metal?: string;
              ounces?: number;
              value_nzd?: number;
              current_value_nzd?: number;
            }[];
            spot?: { goldNZD?: number; silverNZD?: number };
          };
        };

        if (cancelled) return;

        const holdings = stocksJson.ok && Array.isArray(stocksJson.data) ? stocksJson.data : [];
        const cash = txJson.ok ? Number(txJson.data?.cashBalance || 0) : 0;
        let stockVal = 0;
        let cryptoVal = 0;
        for (const h of holdings) {
          const qty = Number((h as any).shares ?? h.quantity ?? 0);
          const px = Number(h.current_price ?? h.price ?? 0);
          const v = Number(
            h.value_nzd ?? h.current_value ?? h.market_value ?? (qty > 0 && px > 0 ? qty * px : 0)
          );
          if ((h.asset_type || "stock") === "crypto") cryptoVal += v;
          else stockVal += v;
        }

        let metalsVal = 0;
        if (metalsJson.ok && metalsJson.data?.metals) {
          const spot = metalsJson.data.spot;
          for (const m of metalsJson.data.metals) {
            const direct = Number(m.value_nzd ?? m.current_value_nzd ?? 0);
            if (direct > 0) {
              metalsVal += direct;
              continue;
            }
            const oz = Number(m.ounces || 0);
            const metal = (m.metal || "").toLowerCase();
            const px =
              metal.includes("silver")
                ? Number(spot?.silverNZD || 0)
                : Number(spot?.goldNZD || 0);
            metalsVal += oz * px;
          }
        }

        const total = cash + stockVal + cryptoVal + metalsVal;
        // Cash on the ledger counts — never claim "no cash" when NZD balance > 0.
        const isEmpty = cash <= 0 && holdings.length === 0 && metalsVal <= 0 && total <= 0;
        const classes: { label: string; weight: number; valueNZD: number }[] = [];
        const pushClass = (label: string, valueNZD: number) => {
          if (valueNZD <= 0 && label !== "Cash") return;
          classes.push({
            label,
            valueNZD,
            weight: total > 0 ? (valueNZD / total) * 100 : 0,
          });
        };
        pushClass("Cash", cash);
        pushClass("Stocks", stockVal);
        pushClass("Crypto", cryptoVal);
        pushClass("Metals", metalsVal);

        applySynthesis({
          asOf: new Date().toISOString().slice(0, 10),
          totalValueNZD: total,
          cashBalanceNZD: cash,
          classAllocation: classes,
          isEmpty,
        });
      } catch {
        /* ledger fallback optional */
      } finally {
        if (!cancelled) setBookLoading(false);
      }
    }

    (async () => {
      try {
        const res = await fetch("/api/totalum", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { synthesis?: BookSnapshot };
        };
        if (cancelled) return;
        if (json.ok && json.data?.synthesis) {
          applySynthesis(json.data.synthesis);
          return;
        }
        await loadLedgerFallback();
      } catch {
        await loadLedgerFallback();
      }
    })().finally(() => { if (!cancelled) setBookLoading(false); });
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
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 3
          ? prev
          : [...prev, id]
    );
  }

  async function send(text: string, opts?: { prependAssistant?: string }) {
    const content = text.trim();
    if (!content || sending) return;
    setShowCards(false);
    setInput("");
    setAttachOpen(false);

    if (opts?.prependAssistant) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: opts.prependAssistant! },
        { role: "user", content },
      ]);
    } else {
      setMessages((prev) => [...prev, { role: "user", content }]);
    }
    setSending(true);

    // Always re-read live ledger cash before any cash / holdings claim so the
    // Guide never contradicts a book that already has NZD on deposit.
    let liveBook = bookSnapshot;
    try {
      const txRes = await fetch("/api/transactions", { credentials: "include" });
      const txJson = (await txRes.json()) as { ok?: boolean; data?: { cashBalance?: number } };
      if (txJson.ok) {
        const cash = Number(txJson.data?.cashBalance || 0);
        liveBook = {
          ...(liveBook || {}),
          cashBalanceNZD: cash,
          totalValueNZD: Math.max(Number(liveBook?.totalValueNZD || 0), cash),
          isEmpty: cash <= 0 && !((liveBook?.classAllocation || []).some((c) => (c.valueNZD || 0) > 0 || c.label !== "Cash")),
          asOf: new Date().toISOString().slice(0, 10),
        };
        if (cash > 0) liveBook.isEmpty = false;
        setBookSnapshot(liveBook);
        if (cash > 0) {
          setHeadmasterPlan((prev) =>
            prev && /book is empty/i.test(prev)
              ? `Latest ledger cash about NZ$${Math.round(cash).toLocaleString()}.`
              : prev
          );
        }
      }
    } catch {
      /* keep prior snapshot */
    }

    try {
      const historyForApi = (
        opts?.prependAssistant
          ? [
              ...messages,
              { role: "assistant" as const, content: opts.prependAssistant },
            ]
          : messages
      )
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 2000),
        }));

      const res = await fetch("/api/portfolio-coach", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: historyForApi,
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

  function handleCard(card: EntryCard) {
    if (card.href) {
      setShowCards(false);
      return;
    }
    if (card.kind === "overview") {
      if (bookLoading || !bookSnapshot) {
        void send(
          card.prompt ||
            "Is my portfolio looking how it should? Please give a clear Dashboard Overview.",
          {
            prependAssistant:
              "**Dashboard overview**\n\n" +
              "Still loading your ledger and portfolio — I will not guess cash as NZ$0 while that is in flight. " +
              "Ask again in a moment for a live read, or wait for the book snapshot to finish loading.",
          }
        );
        return;
      }
      // send() always re-reads /api/transactions before cash claims.
      const snapshot = formatBookSnapshot(bookSnapshot);
      void send(
        card.prompt ||
          "Is my portfolio looking how it should? Please give a clear Dashboard Overview.",
        { prependAssistant: snapshot }
      );
      return;
    }
    if (card.prompt) void send(card.prompt);
  }

  return (
    <div
      className="pg-chat-in fixed bottom-4 right-3 z-[70] flex w-[min(100%-1.5rem,24rem)] flex-col overflow-hidden rounded-2xl border border-amber-400/40 bg-[#06261a]/96 shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_22px_56px_rgba(0,0,0,0.55)] backdrop-blur-md sm:right-5"
      style={{ height: "min(70vh, 34rem)" }}
      role="dialog"
      aria-label="Assistant Guide"
    >
      {/* Header */}
      <div className="relative shrink-0 border-b border-amber-400/30 bg-gradient-to-r from-[#0a3d2a] via-[#0f4f35] to-[#0a3d2a] px-3 pb-3 pt-3">
        <div className="absolute right-2 top-2 flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMinimize}
            className="rounded-md p-1.5 text-amber-100/70 hover:bg-white/10 hover:text-amber-50"
            aria-label="Minimize Assistant Guide"
          >
            <Minimize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="rounded-md p-1.5 text-amber-100/70 hover:bg-white/10 hover:text-amber-50"
            aria-label="Close Assistant Guide"
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
              Assistant Guide
            </p>
            <p className="truncate text-[11px] text-emerald-100/70">
              Keeps your portfolio on track
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
                  : "border border-amber-400/25 bg-[#0c3a28] text-amber-200"
              )}
            >
              {m.role === "assistant" ? (
                <Markdown
                  content={m.content}
                  className="text-sm text-amber-200 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-amber-300 [&_a]:underline [&_ol]:my-2 [&_ul]:my-2 [&_p]:text-amber-200 [&_li]:text-amber-200 [&_strong]:text-amber-100 [&_h2]:text-amber-100 [&_h3]:text-amber-100 [&_h4]:text-amber-200 [&_code]:text-amber-100 [&_hr]:border-amber-400/30"
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
                "border-amber-400/25 bg-[#0c3a28]/80 hover:border-amber-400/45 hover:bg-[#0f4f35]/70"
              );
              const inner = (
                <>
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
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
                  <Link
                    key={card.id}
                    href={card.href}
                    className={className}
                    onClick={() => setShowCards(false)}
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleCard(card)}
                  className={className}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        ) : null}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-amber-200/80">
            <Loader2 className="size-3.5 animate-spin text-amber-300" />
            Assistant Guide is preparing the next steps…
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
              Select up to three recent reports. Their summaries are sent with
              your next message.
            </p>
            {reportsLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-emerald-100/70">
                <Loader2 className="size-3.5 animate-spin text-amber-300" />
                Loading reports…
              </div>
            ) : reports.length === 0 ? (
              <p className="py-2 text-[11px] text-emerald-100/65">
                No Stox or Koins reports yet. Run one from the{" "}
                <Link
                  href={REPORT_CENTER_HREF}
                  className="text-amber-300 hover:underline"
                >
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
            placeholder="Or type a question…"
            className="h-9 flex-1 rounded-xl border border-amber-400/25 bg-[#0a2f22] px-3 text-sm text-amber-100 placeholder:text-amber-200/55 focus:border-amber-400/50 focus:outline-none"
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
