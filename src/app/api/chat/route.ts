import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { buildPortfolioContext, ANALYST_SYSTEM_PROMPT } from "@/lib/ai-context";
import { createGrokChatCompletion, type GrokMessage } from "@/lib/grok";
import type { Stock } from "@/lib/portfolio";

const postSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
});

// GET /api/chat — load the user's chat history
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const result = await totalumSdk.crud.query("chat_message", {
      _filter: { user: user._id },
      _sort: { createdAt: "asc" },
      _limit: 200,
    });

    const messages = (result?.data as any[]) || [];
    return NextResponse.json({ ok: true, data: messages });
  } catch (err: any) {
    console.error("[api/chat] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load chat" }, { status: 500 });
  }
}

// POST /api/chat — send a message and get an AI reply
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const userMessage = parsed.data.message.trim();

    // Persist the user's message
    await totalumSdk.crud.createRecord("chat_message", {
      role: "user",
      content: userMessage,
      user: user._id,
    });

    // Load portfolio context
    const stocksRes = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 500,
    });
    const stocks = ((stocksRes?.data as any[]) || []) as Stock[];
    const context = buildPortfolioContext(stocks);

    // Load recent conversation for continuity (last ~12 messages)
    const historyRes = await totalumSdk.crud.query("chat_message", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 12,
    });
    const history = ((historyRes?.data as any[]) || [])
      .reverse()
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })) as GrokMessage[];

    const messages: GrokMessage[] = [
      {
        role: "system",
        content:
          `${ANALYST_SYSTEM_PROMPT}\n\n` +
          `The user's name is ${user.name}. Here is their live portfolio context — use it to answer questions:\n\n${context}`,
      },
      ...history,
    ];

    console.log(`[api/chat] Generating Grok reply for user ${user._id}`);
    const reply = await createGrokChatCompletion({
      messages,
      maxTokens: 1000,
      temperature: 0.7,
    });

    // Persist the assistant reply
    const saved = await totalumSdk.crud.createRecord("chat_message", {
      role: "assistant",
      content: reply,
      user: user._id,
    });

    return NextResponse.json({
      ok: true,
      data: { reply, message: saved?.data ?? { role: "assistant", content: reply } },
    });
  } catch (err: any) {
    console.error("[api/chat] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to send message" }, { status: 500 });
  }
}

// DELETE /api/chat — clear the user's chat history
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const result = await totalumSdk.crud.query("chat_message", {
      _filter: { user: user._id },
      _limit: 500,
    });
    const messages = (result?.data as any[]) || [];
    await Promise.all(
      messages.map((m) =>
        totalumSdk.crud.deleteRecordById("chat_message", m._id).catch((e) => {
          console.error("[api/chat] DELETE failed for", m._id, e);
        })
      )
    );

    return NextResponse.json({ ok: true, data: { cleared: messages.length } });
  } catch (err: any) {
    console.error("[api/chat] DELETE error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to clear chat" }, { status: 500 });
  }
}
