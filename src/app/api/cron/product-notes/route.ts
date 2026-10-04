import { NextResponse } from "next/server";
import { handleProductNoteRequest } from "@/lib/product-note";
import {
  buildLiveProductNote,
  deliverProductNote,
  loadRegisteredRecipients,
} from "@/lib/product-note-live";

/**
 * GET|POST /api/cron/product-notes
 *
 * Weekday product notes for every registered user:
 *   Monday and Wednesday 10:15 Pacific/Auckland
 *   Friday 17:15 Pacific/Auckland, after the 16:45 cash close
 *
 * No cron trigger is installed. A deploy does not call this route.
 * PRODUCT_NOTE_SEND must be exactly "on" or the handler returns without
 * building a note and without calling the mail sender.
 * CRON_SECRET is also required. If it is missing the route stays closed.
 */

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const result = await handleProductNoteRequest({
    url: req.url,
    headers: req.headers,
    env: {
      CRON_SECRET: process.env.CRON_SECRET,
      PRODUCT_NOTE_SEND: process.env.PRODUCT_NOTE_SEND,
    },
    now: new Date(),
    loadRecipients: loadRegisteredRecipients,
    build: buildLiveProductNote,
    send: deliverProductNote,
  });
  if (result.body.sender === "off") {
    console.log(`[product-notes] sender off (${result.body.reason}). No email sent.`);
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[product-notes] GET error:", err);
    return NextResponse.json({ ok: false, sent: 0, sender: "off", reason: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[product-notes] POST error:", err);
    return NextResponse.json({ ok: false, sent: 0, sender: "off", reason: "failed" }, { status: 500 });
  }
}
