"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HOLDINGS_IMPORT_DRAFT_KEY } from "@/lib/holdings-csv";
import { BrokerImportPanel } from "@/components/import/BrokerImportPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

/**
 * One importer for shares, crypto and the other books.
 * The file is reviewed in a modal. Nothing is saved before Confirm.
 */
export function HoldingsCsvImport({
  assetType,
  onImported,
}: {
  assetType: "stock" | "crypto";
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const router = useRouter();

  async function onFile(file: File) {
    setBusy(true);
    try {
      const body = await file.text();
      if (assetType === "stock") {
        try {
          sessionStorage.setItem(HOLDINGS_IMPORT_DRAFT_KEY, body);
        } catch {
          toast.error("That file could not be kept for review.");
          return;
        }
      }
      setText(body);
      setFileName(file.name);
      setOpen(true);
    } catch (err) {
      console.error("[holdings-csv] import failed", err);
      toast.error("That file could not be read.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label={`Import ${assetType} holdings from CSV`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
        Import CSV
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <DialogDescription>
              Supported files: Sharesies, Hatch, Kernel, Stake, IBKR, Binance, Easy Crypto, and an AetherForge
              export. Dates can be 13 Oct 2026, an ISO date, or day/month/year. Review every row before anything
              is saved.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
            Choose file
          </Button>
          {open && text ? (
            <BrokerImportPanel embedded initialText={text} initialFileName={fileName} onImported={onImported} />
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (assetType === "stock" && text) {
                try {
                  sessionStorage.setItem(HOLDINGS_IMPORT_DRAFT_KEY, text);
                } catch {
                  toast.error("That file could not be kept for review.");
                  return;
                }
              }
              router.push("/import");
            }}
          >
            Open the import page
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
