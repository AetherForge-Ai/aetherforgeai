"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Clock, ShieldCheck, CheckCircle2, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import {
  PROOF_TRANSACTIONS_IMG,
  PROOF_NETWORTH_IMG,
  PROOF_CRYPTO_IMG,
  PROOF_STOCK_IMG,
} from "../../../assets/files";

type Proof = {
  src: string;
  alt: string;
  title: string;
  badge: string;
  points: string[];
};

// Honest, evidence-based captions written from what each screenshot actually
// shows. The four shots are a single multi-asset portfolio tracked live through
// 2026-07-08 — net worth climbing NZ$100,429 → NZ$101,240 → NZ$101,645.
const PROOFS: Proof[] = [
  {
    src: PROOF_TRANSACTIONS_IMG,
    alt: "AI trading bot accurate transaction log today — NZX, ASX, US and crypto buys recorded with live P&L and fees",
    title: "Every Trade, Logged to the Cent — Across Four Markets at Once",
    badge: "Captured today · 9:20am",
    points: [
      "Real buys recorded across NZX (PEB.NZ), ASX (STO.AX), US equities (CDW), crypto (SOL · ADA · DOGE) and physical gold — one unified ledger.",
      "Exact quantity, price, fees, cash impact and realised P&L captured automatically, timestamped 7–8 Jul 2026.",
      "A clean audit trail means you always know your true cost basis before you sell — no spreadsheet guesswork.",
    ],
  },
  {
    src: PROOF_NETWORTH_IMG,
    alt: "Live portfolio bot performance proof — multi-asset net worth NZ$100,429 tracked in real time across stocks, crypto and metals",
    title: "Your Entire Net Worth, Consolidated Live — NZ$100,429",
    badge: "Captured today",
    points: [
      "Cash, stocks (NZ$55,567), crypto (NZ$19,700) and metals (NZ$14,808) totalled instantly into a single NZD figure.",
      "Holdings in multiple currencies are converted with live FX, so your real position is never a rough estimate.",
      "Allocation bars expose concentration at a glance — the first step to genuinely managing portfolio risk.",
    ],
  },
  {
    src: PROOF_CRYPTO_IMG,
    alt: "AI trading bot accurate crypto analytics today — live Sharpe ratio, volatility, win rate and 7-day alpha potential",
    title: "30 Minutes Later — NZ$101,240, With Institutional Analytics",
    badge: "Captured today · +30 min",
    points: [
      "Real-time metrics most retail tools never show: Sharpe 0.15, annual volatility 42.9%, win rate 67%, diversification 67%.",
      "A 7-day alpha potential of +1.98% and a 60/100 health score turn raw prices into a clear, actionable read.",
      "Same portfolio as the shot before — the net worth updated live as the market moved beneath it.",
    ],
  },
  {
    src: PROOF_STOCK_IMG,
    alt: "Live portfolio bot performance proof — NZX and ASX stock net worth NZ$101,645 tracked today at 2:30pm",
    title: "By 2:30pm — NZ$101,645, Up ~NZ$1,200 on the Day",
    badge: "Captured today · 2:30pm",
    points: [
      "Stocks, crypto, metals and cash tracked simultaneously for one complete, real-time picture.",
      "The same health, volatility, Sharpe and win-rate analytics applied across your equities book.",
      "Three timestamped snapshots, one clear upward line — proof the numbers are live, not static marketing.",
    ],
  },
];

export function LiveExamplesGallery() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const show = useCallback(
    (dir: number) =>
      setOpenIndex((i) => (i === null ? i : (i + dir + PROOFS.length) % PROOFS.length)),
    []
  );

  // Keyboard navigation for the lightbox (Esc / arrows) + scroll lock.
  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") show(1);
      if (e.key === "ArrowLeft") show(-1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [openIndex, close, show]);

  const active = openIndex === null ? null : PROOFS[openIndex];

  return (
    <>
      {/* Masonry-style responsive gallery. Balanced 2-column layout on desktop. */}
      <div className="grid gap-6 md:grid-cols-2">
        {PROOFS.map((p, i) => (
          <figure
            key={p.src}
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/40 shadow-lg backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow"
          >
            {/* Clickable image → lightbox */}
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              className="relative block w-full cursor-zoom-in overflow-hidden bg-[#0B1426]"
              aria-label={`Open larger view: ${p.title}`}
            >
              <img
                src={p.src}
                alt={p.alt}
                loading={i < 2 ? "eager" : "lazy"}
                className="h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
              />
              {/* Timestamp badge */}
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[#0B1426]/85 px-3 py-1 text-[11px] font-semibold text-primary backdrop-blur">
                <Clock className="size-3" /> {p.badge}
              </span>
              {/* Zoom hint */}
              <span className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-border/60 bg-[#0B1426]/85 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-4" />
              </span>
            </button>

            {/* Caption card */}
            <figcaption className="flex flex-1 flex-col gap-4 p-6">
              <h3 className="font-display text-lg font-bold leading-snug tracking-tight sm:text-xl">
                {p.title}
              </h3>
              <ul className="space-y-2.5">
                {p.points.map((pt) => (
                  <li key={pt} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border/50 pt-4 text-[11px] font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <ShieldCheck className="size-3.5" /> Verifiable against live markets
                </span>
                <span className="text-muted-foreground/60">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Unedited · timestamped
                </span>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Lightbox / modal */}
      {active && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050912]/90 p-4 backdrop-blur-md sm:p-8"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
        >
          {/* Close */}
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 z-10 flex size-11 items-center justify-center rounded-full border border-border/60 bg-card/70 text-foreground transition-colors hover:bg-card"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>

          {/* Prev / Next */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              show(-1);
            }}
            className="absolute left-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card/70 text-foreground transition-colors hover:bg-card sm:left-6"
            aria-label="Previous"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              show(1);
            }}
            className="absolute right-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card/70 text-foreground transition-colors hover:bg-card sm:right-6"
            aria-label="Next"
          >
            <ChevronRight className="size-5" />
          </button>

          {/* Image + caption */}
          <figure
            className="flex max-h-full w-full max-w-5xl flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={active.src}
              alt={active.alt}
              className="max-h-[74vh] w-auto max-w-full rounded-xl border border-border/60 object-contain shadow-2xl"
            />
            <figcaption className="flex flex-col items-center gap-1.5 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                <Clock className="size-3" /> {active.badge}
              </div>
              <p className="max-w-2xl font-display text-base font-semibold text-foreground sm:text-lg">
                {active.title}
              </p>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
