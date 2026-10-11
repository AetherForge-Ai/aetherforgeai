"use client";

import { useState } from "react";
import Link from "next/link";
import { CSV_LOCK_LABEL, csvLockAccessibleName } from "@/lib/csv-lock-label";

/**
 * Paid CSV download. A Free plan never follows the export URL, so a 403
 * JSON body cannot replace the page. The server gate stays in place.
 * pull-check:batch1-2026-10-11 B1-2
 */
export function CsvExportButton({
  href,
  allowed,
  exportName,
  idleLabel = "CSV",
}: {
  href: string;
  allowed: boolean;
  /** Which file is locked, e.g. "Dividends CSV". */
  exportName?: string;
  /** Button text when the download is allowed. */
  idleLabel?: string;
}) {
  const [locked, setLocked] = useState(!allowed);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function download() {
    if (locked) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(href, { credentials: "include", cache: "no-store" });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || type.includes("json")) {
        const body = (await res.json().catch(() => null)) as { data?: { code?: string } } | null;
        if (res.status === 403 || body?.data?.code === "not_entitled") {
          setLocked(true);
          setNote(csvLockAccessibleName(exportName));
          return;
        }
        setNote("The CSV could not be downloaded.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "");
      link.href = url;
      link.download = match?.[1] || "export.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote("The CSV could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled
          aria-label={csvLockAccessibleName(exportName)}
          className="rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"
        >
          {CSV_LOCK_LABEL}
        </button>
        <Link href="/pricing" className="text-xs font-semibold text-primary underline-offset-4 hover:underline">
          See plans
        </Link>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-semibold"
      >
        {busy ? "Preparing…" : idleLabel}
      </button>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </span>
  );
}
