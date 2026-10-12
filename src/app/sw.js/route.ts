import { NextResponse } from "next/server";
import { PWA_WORKER_SCRIPT } from "@/lib/pwa-worker";

export const dynamic = "force-static";

/** /sw.js must be JavaScript. An empty Content-Type makes every page log "The script does not have a MIME type." */
export function GET() {
  return new NextResponse(PWA_WORKER_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
