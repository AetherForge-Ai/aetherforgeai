import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { assistantQueryLimit, aucklandMonthKey } from "@/lib/entitlements";
import { totalumSdk } from "@/lib/totalum";
import { assistantUsedThisMonth } from "@/lib/assistant-quota.server";
import { buildPortfolioContext, ANALYST_SYSTEM_PROMPT } from "@/lib/ai-context";
import { createGrokChatCompletion, type GrokMessage } from "@/lib/grok";
import { ASSISTANT_SHARE_PICK_REPLY, isSharePickRequest, withAssistantDisclaimer, withGuideDisclaimer } from "@/lib/guide-safety";
import { assistantCompletionMessages } from "@/lib/ai-request-payload";
import type { Stock } from "@/lib/portfolio";

const postSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
});

/** User-role Market Assistant messages already sent in the current Auckland month. */
// b28 L-4: one count for every Assistant surface (was capped at 200 rows, so Pro could not reach 500).
const freeAssistantUsedThisMonth = (userId: string) => assistantUsedThisMonth(userId);

// GET /api/chat — load the user's chat history
export async function GET(req?: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    // b26 L-4: a light quota read for the counter (used / plan limit), no history.
    if (req && new URL(req.url).searchParams.get("quota") === "1") {
      const lim = assistantQueryLimit(user.subscription_plan);
      const usedNow = await freeAssistantUsedThisMonth(user._id);
      return NextResponse.json({ ok: true, data: { used: usedNow, limit: lim, remaining: lim == null ? null : Math.max(0, lim - usedNow) } });
    }

    const result = await totalumSdk.crud.query("chat_message", {
      _filter: { user: user._id },
      _sort: { createdAt: "asc" },
      _limit: 200,
    });

    const messages = (result?.data as any[]) || [];
    const stocksRes = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 1,
    });
    const emptyBook = !((stocksRes?.data as unknown[]) || []).length;
    const queryLimit = assistantQueryLimit(user.subscription_plan);
    const used = queryLimit != null ? await freeAssistantUsedThisMonth(user._id) : 0;
    return NextResponse.json({
      ok: true,
      data: {
        messages,
        remaining: queryLimit == null ? null : Math.max(0, queryLimit - used),
        used,
        limit: queryLimit,
        emptyBook,
      },
    });
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

    const queryLimit = assistantQueryLimit(user.subscription_plan);
    let used0 = 0;
    if (queryLimit != null) {
      used0 = await freeAssistantUsedThisMonth(user._id);
      if (used0 >= queryLimit) {
        return NextResponse.json(
          {
            ok: false,
            error: `You've used this month's ${queryLimit} Market Assistant queries. You can wait until next month, or move to a plan with a higher allowance.`,
          },
          { status: 429 }
        );
      }
    }

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

    const bookLine = stocks.length
      ? `Here is the portfolio context — use it to answer questions:\n\n${context}`
      : "The book is empty. Add holdings or cash and the notes can explain them.";
    const messages: GrokMessage[] = assistantCompletionMessages({
      systemPrompt: ANALYST_SYSTEM_PROMPT,
      bookLine,
      history,
    });

    // b27 CR-2: share-pick questions get a fixed refusal; no model call, so it holds even when the
    // provider is down or a prompt tries to talk the model round.
    const usedBefore = queryLimit != null ? used0 : null;
    const refused = isSharePickRequest(userMessage);
    if (refused) console.info(`[api/chat] share-pick refusal for user ${user._id}`);
    else console.log(`[api/chat] Generating Grok reply for user ${user._id}`);
    const reply = refused
      ? withGuideDisclaimer(ASSISTANT_SHARE_PICK_REPLY)
      : // b45 G-23-TAXLABEL: model replies end with the AI line, plus the tax label when NZ tax is discussed.
        withAssistantDisclaimer(
          await createGrokChatCompletion({
            messages,
            maxTokens: 1000,
            temperature: 0.7,
          })
        );

    // Persist the assistant reply
    const saved = await totalumSdk.crud.createRecord("chat_message", {
      role: "assistant",
      content: refused ? withGuideDisclaimer(reply) : reply,
      user: user._id,
    });

    // b28 L-4: used+1 from the pre-question read; a re-read can miss the row just written.
    const usedAfter = usedBefore != null ? usedBefore + 1 : null;
    return NextResponse.json({
      ok: true,
      data: {
        reply,
        message: saved?.data ?? { role: "assistant", content: reply },
        remaining: queryLimit == null || usedAfter == null ? null : Math.max(0, queryLimit - usedAfter),
        used: usedAfter,
        limit: queryLimit,
      },
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
