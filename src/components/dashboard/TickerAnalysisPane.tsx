"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";

/**
 * Compact "Stox / Koins" AI analysis pane embedded in the detailed stock view.
 * On open it auto-runs a professional read on the ticker (grounded with a fresh
 * live quote server-side), then lets the user ask focused follow-up questions.
 *
 * It talks to POST /api/ticker-analysis — the same AI backend that powers the
 * main AI Assistant — so it never touches or disturbs the persistent Stox/Koins
 * chat history on /chat.
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Minimal Markdown → formatted text (bold + bullets) for the AI reply. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function FormattedReply({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return (
    <div className="space-y-1.5 text-[0.8rem] leading-relaxed">
      {lines.map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const clean = line.replace(/^\s*[-*•]\s+/, "").replace(/^#+\s*/, "");
        return bullet ? (
          <div key={i} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
            <p>{renderInline(clean)}</p>
          </div>
        ) : (
          <p key={i} className={cn(/^#+\s/.test(line) && "font-semibold text-foreground")}>
            {renderInline(clean)}
          </p>
        );
      })}
    </div>
  );
}

export function TickerAnalysisPane({
  symbol,
  name,
  botName = "Stox",
}: {
  symbol: string;
  name?: string;
  /** Label for the assistant — "Stox" for equities, "Koins" for crypto. */
  botName?: string;
}) {
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoAskedFor = useRef<string | null>(null);

  const ask = useCallback(
    async (question?: string) => {
      setLoading(true);
      if (question) setTurns((t) => [...t, { role: "user", content: question }]);
      console.log(`[ticker-analysis] Asking ${botName} about ${symbol}`);
      const res = await api.post<{ reply: string }>("/api/ticker-analysis", {
        symbol,
        name,
        question,
      });
      if (res.ok && res.data?.reply) {
        setHidden(false);
        setTurns((t) => [...t, { role: "assistant", content: res.data!.reply }]);
      } else if (res.status !== 401) {
        console.error("[ticker-analysis] Failed:", res.error);
        if (!question) setHidden(true);
      } else if (!question) {
        setHidden(true);
      }
      setLoading(false);
    },
    [symbol, name, botName]
  );

  // Auto-run once per ticker for a signed-in member. A guest must not hit the 401 route.
  useEffect(() => {
    if (isPending || !signedIn) return;
    if (autoAskedFor.current === symbol) return;
    autoAskedFor.current = symbol;
    setTurns([]);
    setInput("");
    setHidden(false);
    void ask();
  }, [symbol, signedIn, isPending, ask]);

  // Keep the transcript scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    ask(q);
  }

  if (isPending || !signedIn) return null;
  if (hidden && turns.length === 0 && !loading) return null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/8 to-card/40">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {botName} AI <Sparkles className="size-3.5 text-primary" />
          </p>
          <p className="truncate text-[0.66rem] text-muted-foreground">
            AI-written note · {symbol}
          </p>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-[0.8rem]">
              {t.content}
            </div>
          ) : (
            <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border/50 bg-background/50 px-3 py-2.5">
              <FormattedReply text={t.content} />
            </div>
          )
        )}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {botName} is analysing {symbol}…
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border/60 p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${botName} about ${symbol}…`}
          disabled={loading}
          className="h-9"
        />
        <Button type="submit" size="icon" className="size-9 shrink-0" disabled={loading || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>

      <p className="px-4 pb-3 text-center text-[0.62rem] text-muted-foreground">
        AI-generated · not personalised financial advice.
      </p>
    </div>
  );
}
