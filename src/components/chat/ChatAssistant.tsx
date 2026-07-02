"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Bot, Send, Loader2, Sparkles, Trash2, User } from "lucide-react";

interface ChatMessage {
  _id?: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  "How diversified is my portfolio?",
  "What are the biggest risks in my holdings?",
  "Summarize today's market sentiment for tech stocks.",
  "Which of my positions is underperforming and why?",
];

export function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const res = await api.get<ChatMessage[]>("/api/chat");
      if (res.ok && res.data) {
        setMessages(res.data);
      } else {
        console.error("[chat] Failed to load history:", res.error);
      }
      setLoadingHistory(false);
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setSending(true);
    console.log("[chat] Sending message:", content);

    const res = await api.post<{ reply: string }>("/api/chat", { message: content });
    setSending(false);

    if (res.ok && res.data?.reply) {
      setMessages((prev) => [...prev, { role: "assistant", content: res.data!.reply }]);
    } else {
      console.error("[chat] Send failed:", res.error);
      toast.error("The assistant could not respond. Please try again.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry — I ran into an issue answering that. Please try again in a moment.",
        },
      ]);
    }
  }

  async function clearHistory() {
    const res = await api.delete("/api/chat");
    if (res.ok) {
      setMessages([]);
      toast.success("Conversation cleared");
    } else {
      console.error("[chat] Clear failed:", res.error);
      toast.error("Could not clear the conversation.");
    }
  }

  const isEmpty = !loadingHistory && messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-4xl flex-col px-4 sm:px-6 lg:h-screen lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/60 py-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <Bot className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold">AI Market Assistant</h1>
            <p className="text-xs text-muted-foreground">
              Ask about your portfolio, holdings, or the markets.
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory} className="text-muted-foreground">
            <Trash2 className="mr-2 size-4" /> Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto py-6">
        {loadingHistory ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/30" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <span className="grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
              <Sparkles className="size-8" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold">How can I help you invest?</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              I have context on your live portfolio. Ask me anything about your holdings, risk, or
              the broader market.
            </p>
            <div className="mt-7 grid w-full max-w-lg gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-2xl border border-border/70 bg-card/50 p-4 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={m._id ?? i}
              className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.role === "assistant" && (
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Bot className="size-4" />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border/60 bg-card/60"
                )}
              >
                {m.role === "assistant" ? (
                  <Markdown content={m.content} className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                )}
              </div>
              {m.role === "user" && (
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <User className="size-4" />
                </span>
              )}
            </div>
          ))
        )}

        {sending && (
          <div className="flex gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Bot className="size-4" />
            </span>
            <div className="flex items-center gap-1.5 rounded-2xl border border-border/60 bg-card/60 px-4 py-3.5">
              <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-border/70 bg-card/60 p-2 focus-within:border-primary/40"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask about your portfolio or the markets…"
            rows={1}
            className="max-h-40 min-h-[2.5rem] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !input.trim()}
            className="size-10 shrink-0 rounded-xl"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          AI responses are informational only and not financial advice.
        </p>
      </div>
    </div>
  );
}
