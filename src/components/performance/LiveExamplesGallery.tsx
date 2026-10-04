"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  FolderOpen,
  CalendarDays,
} from "lucide-react";
import {
  PROOF_TRANSACTIONS_IMG,
  PROOF_NETWORTH_IMG,
  PROOF_CRYPTO_IMG,
  PROOF_STOCK_IMG,
  PROOF_CLOSE_IMG,
  PROOF_OVERVIEW_IMG,
  PROOF_HOLDINGS_IMG,
} from "../../../assets/files";

// Dated folder for the 7–8 July 2026 sample.
const TODAY_LABEL = "8/7/2026";

type Proof = {
  src: string;
  alt: string;
  title: string;
  badge: string;
  points: string[];
};

// One paper book, 7–8 July 2026. 1.98% is only the day's mark from
// NZ$100,429 to NZ$102,421.30. The day's high is that last figure.
const PROOFS: Proof[] = [
  {
    src: PROOF_TRANSACTIONS_IMG,
    alt: "Paper portfolio log from 7–8 July 2026 — positions typed into the paper book, not orders sent to a broker",
    title: "Paper log — positions entered on the book",
    badge: "7–8 Jul 2026 · 9:20am",
    points: [
      "This is a paper portfolio. AetherForge did not place these trades. The rows are entries on the paper book.",
      "The log lists ticker, quantity, price and fees as they were entered on the paper book that morning.",
      "It is a dated sample of the ledger screen, not an instruction and not a broker fill.",
    ],
  },
  {
    src: PROOF_NETWORTH_IMG,
    alt: "Paper portfolio on 7–8 July 2026 marked at NZ$100,429",
    title: "Opening mark — NZ$100,429",
    badge: "7–8 Jul 2026",
    points: [
      "Cash, stocks (NZ$55,567), crypto (NZ$19,700) and metals (NZ$14,808) summed to NZ$100,429 on this paper book.",
      "That figure is the start of the day used for the 1.98% mark-to-market change.",
      "It is one session's paper mark, not a forecast.",
    ],
  },
  {
    src: PROOF_CRYPTO_IMG,
    alt: "Paper portfolio about 30 minutes later on 7–8 July 2026, marked at NZ$101,240, Sharpe 0.15",
    title: "About 30 minutes later — NZ$101,240",
    badge: "7–8 Jul 2026 · +30 min",
    points: [
      "The same paper book was marked at NZ$101,240. This snapshot is not the day's high and it is not the 1.98% figure.",
      "The screen shows one Sharpe reading of 0.15, with volatility 42.9% and a health score of 60/100.",
      "Those are labels on that screenshot. They are not a second return and not a claim about other platforms.",
    ],
  },
  {
    src: PROOF_STOCK_IMG,
    alt: "Paper portfolio net worth NZ$101,645 on 7–8 July 2026 at 2:30pm",
    title: "2:30pm — NZ$101,645",
    badge: "7–8 Jul 2026 · 2:30pm",
    points: [
      "A later mark on the same paper book: NZ$101,645.",
      "Still the same day, still short of the day's high.",
      "An intermediate mark only. The 1.98% figure is the open-to-high change, not this card.",
    ],
  },
  {
    src: PROOF_CLOSE_IMG,
    alt: "Paper portfolio net worth NZ$101,931.77 on 8 July 2026 at 3:47pm, before the day's high",
    title: "3:47pm — NZ$101,931.77",
    badge: "8 Jul 2026 · 3:47pm",
    points: [
      "Net worth was marked at NZ$101,931.77, with unrealised profit of NZ$1,836.51 shown on the stock book.",
      "This is an earlier reading. It is not the highest mark of the day.",
      "The day's high comes on the next screenshot.",
    ],
  },
  {
    src: PROOF_OVERVIEW_IMG,
    alt: "Paper portfolio day's high of NZ$102,421.30 on 7–8 July 2026",
    title: "Day's high — NZ$102,421.30",
    badge: "7–8 Jul 2026 · late session",
    points: [
      "The highest mark that day was NZ$102,421.30. The stock book on this screen was NZ$57,331.02.",
      "From the opening NZ$100,429 to this high is about 1.98% over 8–9 hours. That is the only meaning of 1.98% on this page.",
      "It is one paper day. It is not a forecast and not a claim that AetherForge beats every platform.",
    ],
  },
  {
    src: PROOF_HOLDINGS_IMG,
    alt: "Paper portfolio holdings table from 7–8 July 2026 at the day's high of NZ$102,421.30",
    title: "Holdings at the day's high",
    badge: "7–8 Jul 2026 · late session",
    points: [
      "The holdings table is the same paper book at the NZ$102,421.30 high.",
      "Each line shows ticker, units, cost and the mark used that session.",
      "Nothing here was sent to a broker.",
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
      {/* Dated folder header — every capture below is from 7–8 July 2026. */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 backdrop-blur">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <FolderOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {TODAY_LABEL}
            </h3>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <CalendarDays className="size-3" /> 7–8 Jul 2026 sample
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {PROOFS.length} unedited snapshots from the 7–8 July 2026 session, grouped in one dated folder.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <Clock className="size-3.5 text-primary" /> {PROOFS.length} snapshots
        </span>
      </div>

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
                  <ShieldCheck className="size-3.5" /> Paper book · 7–8 July 2026
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
