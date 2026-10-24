"use client";

import { useCallback, useEffect, useState } from "react";

type OwnedShare = {
  id: string;
  portfolioId: string;
  label: "accountant" | "family";
  status: string;
  hasInvitee: boolean;
  expiresAt: string;
  confirmedAt: string | null;
  revokedAt: string | null;
};
type LogRow = { event: string; createdAt?: string };

const nzTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) + " NZT" : "";

const STATUS_TEXT: Record<string, string> = {
  pending: "Link not used yet",
  accepted: "Waiting for you to confirm",
  active: "Can view (read-only)",
  revoked: "Revoked",
  expired: "Link expired",
};

const EVENT_TEXT: Record<string, string> = {
  link_created: "Link created",
  accept: "Link opened and accepted",
  confirm: "You confirmed access",
  view: "Viewed",
  export: "Exported",
  revoke: "Revoked",
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: unknown };
  if (!res.ok || !json.ok) throw new Error(json.error || "Something went wrong.");
  return json.data;
}

/** b66 G-27: owner controls for read-only sharing. Copy-link only; nothing is emailed. */
export function SharingPanel() {
  const [shares, setShares] = useState<OwnedShare[] | null>(null);
  const [label, setLabel] = useState<"family" | "accountant">("accountant");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Record<string, LogRow[]>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/share", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { owned: OwnedShare[] }; error?: string };
    if (json.ok && json.data) setShares(json.data.owned);
    else setError(json.error || "Sharing is unavailable just now.");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-6" data-sharing-panel>
      <div className="rounded-md border p-4">
        <h2 className="text-lg font-semibold">Share your book read-only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Make a link for a family member or your accountant. They can see your holdings and trades, but can't change anything, see your
          goals or chat, or share it on. The link works once and expires after 7 days. We don't email it: copy it and send it yourself.
          You confirm the person before they see anything, and you can revoke access at any time.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block font-medium">Who is it for?</span>
            <select className="mt-1 min-h-11 rounded-md border bg-background px-3" value={label} onChange={(e) => setLabel(e.target.value as "family" | "accountant")} data-share-label>
              <option value="accountant">Accountant</option>
              <option value="family">Family member</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
            data-share-create
            onClick={() =>
              run(async () => {
                const data = (await post({ action: "create", label, portfolioId: "main" })) as { link: string };
                setCopied(false);
                setLink(`${window.location.origin}${data.link}`);
              })
            }
          >
            Make a share link
          </button>
        </div>
        {link ? (
          <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm" role="status" data-share-link>
            <p className="font-medium">Copy this link now. It is shown only once.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input readOnly value={link} aria-label="Share link" className="min-h-11 w-full flex-1 rounded-md border bg-background px-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                className="min-h-11 rounded-md border px-4 font-medium"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="rounded-md border p-4">
        <h2 className="text-lg font-semibold">Your shares</h2>
        {shares == null ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : shares.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">You haven't shared your book with anyone.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {shares.map((s) => (
              <li key={s.id} className="py-3 text-sm" data-share-row={s.status}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{s.label === "accountant" ? "Accountant" : "Family member"}</p>
                    <p className="text-muted-foreground">
                      {STATUS_TEXT[s.status] ?? s.status}
                      {s.status === "pending" ? ` · expires ${nzTime(s.expiresAt)}` : ""}
                      {s.status === "revoked" && s.revokedAt ? ` · ${nzTime(s.revokedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status === "accepted" ? (
                      <button type="button" disabled={busy} className="min-h-11 rounded-md border px-3 font-medium" data-share-confirm onClick={() => run(() => post({ action: "confirm", shareId: s.id }))}>
                        Confirm access
                      </button>
                    ) : null}
                    {s.status !== "revoked" && s.status !== "expired" ? (
                      <button type="button" disabled={busy} className="min-h-11 rounded-md border border-destructive px-3 font-medium text-destructive" data-share-revoke onClick={() => run(() => post({ action: "revoke", shareId: s.id }))}>
                        {s.status === "pending" ? "Cancel link" : "Revoke"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="min-h-11 rounded-md border px-3 font-medium"
                      data-share-log
                      onClick={() =>
                        run(async () => {
                          const rows = (await post({ action: "log", shareId: s.id })) as LogRow[];
                          setLogs((prev) => ({ ...prev, [s.id]: [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) }));
                        })
                      }
                    >
                      Access log
                    </button>
                  </div>
                </div>
                {logs[s.id] ? (
                  <ul className="mt-2 rounded-md bg-muted/40 p-2 text-xs" data-share-log-rows>
                    {logs[s.id].length === 0 ? <li>No events yet.</li> : logs[s.id].map((r, i) => <li key={i}>{nzTime(r.createdAt)} · {EVENT_TEXT[r.event] ?? r.event}</li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
