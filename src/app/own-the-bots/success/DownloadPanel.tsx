"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, Loader2 } from "lucide-react";

type Product = {
  key: "stox" | "koins";
  name: string;
  file: string;
  accent: string; // tailwind bg color for button
  accentHover: string;
};

export function DownloadPanel({ product }: { product: Product }) {
  const [started, setStarted] = useState(false);
  const triggered = useRef(false);

  const href = `/downloads/${product.file}`;

  const triggerDownload = () => {
    setStarted(true);
    const a = document.createElement("a");
    a.href = href;
    a.download = product.file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Auto-start the download shortly after the page loads (premium delivery feel).
  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    const t = setTimeout(() => {
      try {
        triggerDownload();
      } catch (err) {
        console.error("[own-the-bots/success] auto-download failed:", err);
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        onClick={triggerDownload}
        size="lg"
        className={`h-12 px-8 text-base font-semibold text-white shadow-glow ${product.accent} ${product.accentHover}`}
      >
        <Download className="size-5" />
        Download {product.name} package
      </Button>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {started ? (
          <>
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            Your download has started. If nothing happens, click the button above.
          </>
        ) : (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Preparing your secure download…
          </>
        )}
      </p>

      <a href={href} download className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Direct link: {product.file}
      </a>
    </div>
  );
}
