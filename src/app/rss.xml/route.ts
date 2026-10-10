import { CHANGELOG_ENTRIES } from "@/app/changelog/page";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pubDate(title: string): string {
  const match = title.match(/^(\d{1,2} [A-Za-z]{3} \d{4})/);
  const parsed = match ? new Date(`${match[1]} 00:00:00 UTC`) : new Date("2026-10-11T00:00:00Z");
  return Number.isNaN(parsed.getTime()) ? new Date("2026-10-11T00:00:00Z").toUTCString() : parsed.toUTCString();
}

/** GET /rss.xml — changelog notes. No mailbox and no SLA. */
export function GET() {
  const items = CHANGELOG_ENTRIES.map(
    (entry) => `    <item>
      <title>${xml(entry.title)}</title>
      <link>${xml(`${siteUrl}${entry.href}`)}</link>
      <description>${xml(entry.body)}</description>
      <pubDate>${pubDate(entry.title)}</pubDate>
    </item>`
  ).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AetherForge AI changelog</title>
    <link>${xml(siteUrl)}/changelog</link>
    <description>Recent product changes on AetherForge AI.</description>
${items}
  </channel>
</rss>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
