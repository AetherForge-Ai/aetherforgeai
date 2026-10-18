"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface PublicConnection {
  queryId: string;
  lastSync: string | null;
  status: "active" | "error" | "expired";
  lastError: string | null;
}

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return (await res.json().catch(() => ({ ok: false, error: "No answer from the server." }))) as {
    ok: boolean;
    error?: string;
    data?: { configured?: boolean; connection?: PublicConnection | null; notice?: string | null; message?: string };
  };
}

/** IBKR Flex Web Service: read-only. The token input is cleared after saving and never shown again. */
export function IbkrSyncPanel() {
  const [conn, setConn] = useState<PublicConnection | null>(null);
  const [configured, setConfigured] = useState(true);
  const [token, setToken] = useState("");
  const [queryId, setQueryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void call("GET", "/api/broker/ibkr").then((r) => {
      if (!r.ok) return;
      setConfigured(r.data?.configured !== false);
      setConn(r.data?.connection ?? null);
      if (r.data?.notice) setMessage(r.data.notice);
    });
  }, []);

  async function connect() {
    setBusy(true);
    setMessage("");
    const r = await call("POST", "/api/broker/ibkr", { token, queryId });
    setToken("");
    setBusy(false);
    if (!r.ok) return setMessage(r.error || "Not connected.");
    setConn(r.data?.connection ?? null);
    setMessage("Connected. Press Sync now to fetch your statement.");
  }

  async function syncNow() {
    setBusy(true);
    setMessage("Fetching your IBKR statement. This can take up to 15 seconds.");
    const r = await call("POST", "/api/broker/ibkr/sync");
    setBusy(false);
    if (r.data?.connection !== undefined) setConn(r.data.connection ?? null);
    setMessage(r.ok ? r.data?.message || "Synced." : r.error || "Sync failed.");
  }

  async function disconnect() {
    setBusy(true);
    const r = await call("DELETE", "/api/broker/ibkr");
    setBusy(false);
    if (!r.ok) return setMessage(r.error || "Not disconnected.");
    setConn(null);
    setMessage("Disconnected. The stored token was deleted. Trades already imported stay in your book.");
  }

  return (
    <section className="mt-6 rounded-lg border border-border p-4" aria-labelledby="ibkr-sync-heading">
      <h2 id="ibkr-sync-heading" className="text-lg font-semibold text-foreground">
        Interactive Brokers sync (read-only)
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        In IBKR Client Portal, create an Activity Flex Query (Trades and Cash Transactions, XML) and a Flex Web Service
        token. Paste both here. We can only read reports. The token is encrypted and stays on our server. We sync once a
        day and when you press Sync now.
      </p>
      {!configured ? (
        <p className="mt-2 text-sm text-destructive">Broker sync is not switched on yet. Use a file import below for now.</p>
      ) : conn ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            Connected (Query {conn.queryId}). Last sync:{" "}
            {conn.lastSync ? new Date(conn.lastSync).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" }) : "not yet"}.
            {conn.status === "expired" ? " Your token has expired. Paste a new one below." : null}
            {conn.status === "error" && conn.lastError ? ` Last error: ${conn.lastError}` : null}
          </p>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void syncNow()}>
              Sync now
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : null}
      {configured && (!conn || conn.status === "expired") ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <label className="sr-only" htmlFor="ibkr-token">Flex token</label>
          <input id="ibkr-token" type="password" autoComplete="off" inputMode="numeric" placeholder="Flex token" className="rounded border border-border bg-background px-2 py-1 text-sm" value={token} onChange={(e) => setToken(e.target.value)} />
          <label className="sr-only" htmlFor="ibkr-query">Query ID</label>
          <input id="ibkr-query" inputMode="numeric" placeholder="Query ID" className="rounded border border-border bg-background px-2 py-1 text-sm" value={queryId} onChange={(e) => setQueryId(e.target.value)} />
          <Button type="submit" disabled={busy || !token || !queryId}>Connect</Button>
        </form>
      ) : null}
      {message ? <p className="mt-2 text-sm text-muted-foreground" role="status">{message}</p> : null}
    </section>
  );
}
