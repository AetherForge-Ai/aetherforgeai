/**
 * Member email copy. CSS lives in a <style> block because the mail provider
 * strips inline style attributes. The wording still reads without CSS.
 */

export const WELCOME_SUBJECT =
  "Welcome To AetherForgeAI - Intelligent Market and Portfolio Information and Data";

export const SUPPORT_EMAIL = "support@aetherforgeai.co.nz";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function appBase(appUrl?: string | null): string {
  const raw = (appUrl || "https://aetherforgeai.co.nz").trim() || "https://aetherforgeai.co.nz";
  return raw.replace(/\/+$/, "");
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { margin: 0; padding: 0; background: #070b16; color: #e8eef7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 32px 20px 40px; }
  .brand { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #7dd3fc; margin: 0 0 12px; }
  h1 { font-size: 22px; line-height: 1.35; color: #f8fafc; margin: 0 0 14px; }
  h2 { font-size: 16px; line-height: 1.4; color: #f8fafc; margin: 22px 0 8px; }
  p, li { font-size: 15px; line-height: 1.6; color: #c5d0de; }
  ol { margin: 8px 0 0; padding-left: 1.2em; }
  li { margin: 0 0 10px; }
  a { color: #67e8f9; }
  a.button { display: inline-block; margin: 8px 8px 0 0; padding: 12px 18px; border-radius: 10px; background: #22d3ee; color: #070b16; font-weight: 700; text-decoration: none; }
  .card { background: #0d1424; border: 1px solid #1e293b; border-radius: 16px; padding: 24px 22px; }
  .foot { margin: 22px 0 0; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="brand">AetherForge AI</p>
    <div class="card">
      ${body}
    </div>
    <p class="foot">AetherForge AI · Intelligent market and portfolio information. Questions: ${SUPPORT_EMAIL}</p>
  </div>
</body>
</html>`;
}

export function welcomeEmailHtml(input: { name?: string | null; appUrl?: string | null }): string {
  const base = appBase(input.appUrl);
  const greeting = input.name?.trim() ? `Hi ${esc(input.name.trim())},` : "Hi,";
  const dashboard = `${base}/dashboard`;
  const transactions = `${base}/dashboard/transactions`;
  const reports = `${base}/dashboard#report-center`;
  return shell(
    WELCOME_SUBJECT,
    `<h1>Welcome to AetherForge AI</h1>
      <p>${greeting} your account is the place for intelligent market and portfolio information and data. Two short jobs get the desk working: load the holdings you already have, then run the AI bots that write your reports.</p>
      <h2>Load your dashboard with your current holdings</h2>
      <ol>
        <li>Open the verification email and confirm your address. That unlocks the dashboard.</li>
        <li>Open your <a href="${esc(dashboard)}">dashboard</a>.</li>
        <li>In the <a href="${esc(transactions)}">Transaction Centre</a>, deposit the paper cash that matches the cash sitting with your broker.</li>
        <li>Use Buy or Add for each stock, crypto coin, and gold or silver position. Enter the fill price your broker gave you. AetherForge records that paper book. Your broker holds the assets and places the trades.</li>
        <li>Cash Bal on the dashboard is that paper cash. It updates as you record deposits and fills.</li>
      </ol>
      <p><a class="button" href="${esc(transactions)}">Open Transaction Centre</a></p>
      <h2>Run the AI bots for your reports</h2>
      <ol>
        <li>Open <a href="${esc(reports)}">Report Centre</a> on your dashboard.</li>
        <li>Run Stox for your shares. Run Koins for your crypto. Each report uses the holdings and cash on your book.</li>
        <li>A report email arrives when delivery succeeds. You can also read the report and download the PDF in Report Centre.</li>
        <li>The Headmaster is optional. It reads the whole book — shares, crypto, metals, and cash — and shows the keep and reallocate plan.</li>
      </ol>
      <p><a class="button" href="${esc(reports)}">Open Report Centre</a></p>
      <p>Start with the Transaction Centre so the numbers on the dashboard are yours, then run Stox and Koins.</p>`
  );
}

export function reportEmailHtml(input: {
  title: string;
  summary: string;
  appUrl?: string | null;
  generatedAt?: string | null;
  botLabel?: string | null;
}): string {
  const base = appBase(input.appUrl);
  const reports = `${base}/dashboard#report-center`;
  const when = input.generatedAt?.trim() ? esc(input.generatedAt.trim()) : "";
  const who = input.botLabel?.trim() ? esc(input.botLabel.trim()) : "Your bot";
  const summary = esc(input.summary || "").replace(/\n/g, "<br />");
  return shell(
    input.title,
    `<h1>${esc(input.title)}</h1>
      <p>${who}${when ? ` · ${when}` : ""}</p>
      <p>${summary || "Your report is ready in Report Centre."}</p>
      <p>The cash line in this briefing follows the live book: keep 10% of total wealth, and reallocate the cash above that retained amount.</p>
      <p><a class="button" href="${esc(reports)}">Open this report</a></p>
      <p>The full report, including the PDF when one was created, is in Report Centre.</p>`
  );
}

/** True when the provider accepted the message. A thrown error is a failure. */
export function emailSendAccepted(result: unknown): boolean {
  if (result == null) return true;
  if (typeof result !== "object") return true;
  const rec = result as {
    ok?: unknown;
    error?: unknown;
    errors?: { errorMessage?: unknown } | null;
    data?: { error?: unknown; success?: unknown } | null;
  };
  if (rec.ok === false) return false;
  if (typeof rec.error === "string" && rec.error.trim()) return false;
  if (
    rec.errors &&
    typeof rec.errors === "object" &&
    typeof rec.errors.errorMessage === "string" &&
    rec.errors.errorMessage.trim()
  ) {
    return false;
  }
  const nested = rec.data && typeof rec.data === "object" ? rec.data : null;
  if (nested && typeof nested.error === "string" && nested.error.trim()) return false;
  if (nested && nested.success === false) return false;
  return true;
}
