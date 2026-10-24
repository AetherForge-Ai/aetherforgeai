"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "af-share-token";

/** b66 G-27: opens a copy-link invite. The token stays in the URL fragment (never sent in a URL or logged). */
export function AcceptShare() {
  const [state, setState] = useState<"working" | "signin" | "done" | "error">("working");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    if (fromHash) {
      try {
        window.sessionStorage.setItem(KEY, fromHash);
      } catch {
        /* ignore */
      }
      history.replaceState(null, "", window.location.pathname);
    }
    let token = fromHash;
    try {
      token = token || window.sessionStorage.getItem(KEY) || "";
    } catch {
      /* ignore */
    }
    if (!token) {
      setState("error");
      setMessage("This link is missing its code. Ask the owner for a new link.");
      return;
    }
    void (async () => {
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept", token }) });
      if (res.status === 401) return setState("signin");
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      try {
        window.sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      if (res.ok && json.ok) setState("done");
      else {
        setState("error");
        setMessage(json.error || "This link cannot be used.");
      }
    })();
  }, []);

  if (state === "working") return <p className="text-sm text-muted-foreground">Checking the link…</p>;
  if (state === "signin")
    return (
      <p className="text-sm" data-share-signin>
        Sign in or create an account first, then come back to this page.{" "}
        <Link className="font-semibold text-primary underline" href="/login?redirect=/share/accept">
          Sign in
        </Link>
      </p>
    );
  if (state === "done")
    return (
      <p className="text-sm" role="status" data-share-accepted>
        Done. The owner now needs to confirm you. Once they do, the book appears under{" "}
        <Link className="font-semibold text-primary underline" href="/shared">
          Shared with me
        </Link>
        .
      </p>
    );
  return (
    <p className="text-sm text-destructive" role="alert" data-share-error>
      {message}
    </p>
  );
}
