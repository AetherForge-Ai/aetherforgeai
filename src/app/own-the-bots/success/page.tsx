import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BOT_STOX_AVATAR, BOT_KOINS_AVATAR, LOGO_MARK_IMG } from "../../../../assets/files";
import { DownloadPanel } from "./DownloadPanel";
import {
  ArrowRight,
  BadgeCheck,
  Cpu,
  FileSpreadsheet,
  MousePointerClick,
  PartyPopper,
  ShieldCheck,
  Terminal,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Your download is ready | AetherForge AI",
  description: "Thank you for your purchase — download your protected AetherForge bot package.",
  robots: { index: false, follow: false },
};

const PRODUCTS = {
  stox: {
    key: "stox" as const,
    name: "Stox",
    file: "AetherForge-Stox-FullEngine-Binary-v1.0.zip",
    avatar: BOT_STOX_AVATAR,
    tagline: "Stock Market Intelligence Engine",
    blurb: "NZX · ASX · US markets",
    accent: "bg-emerald-600",
    accentHover: "hover:bg-emerald-500",
    ring: "ring-emerald-500/25",
    glow: "bg-emerald-500/25",
    text: "text-emerald-700",
  },
  koins: {
    key: "koins" as const,
    name: "Koins",
    file: "AetherForge-Koins-FullEngine-Binary-v1.0.zip",
    avatar: BOT_KOINS_AVATAR,
    tagline: "Crypto Market Intelligence Engine",
    blurb: "BTC · ETH · major coins",
    accent: "bg-amber-600",
    accentHover: "hover:bg-amber-500",
    ring: "ring-amber-500/25",
    glow: "bg-amber-500/25",
    text: "text-amber-700",
  },
};

const STEPS = [
  {
    icon: FileSpreadsheet,
    title: "Add your portfolio",
    desc: "Open portfolio.csv and enter your holdings (ticker, quantity, average cost).",
  },
  {
    icon: MousePointerClick,
    title: "Launch the bot",
    desc: "Double-click the Windows or Mac/Linux launcher included in the package.",
  },
  {
    icon: Terminal,
    title: "Read your report",
    desc: "A styled HTML report is generated in the reports/ folder — open it in your browser.",
  },
];

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const params = await searchParams;
  const key = (params.product || "").toLowerCase();
  const product = key === "koins" ? PRODUCTS.koins : key === "stox" ? PRODUCTS.stox : null;

  return (
    <div className="chrome-dark relative min-h-screen bg-background bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        <div className="mx-auto w-full max-w-7xl px-2 py-4 sm:px-4 sm:py-5 lg:px-6">
          <div className="content-light relative overflow-hidden rounded-2xl bg-background text-foreground shadow-[0_10px_44px_-16px_rgba(0,0,0,0.55)] ring-1 ring-black/5">
            <div className="pointer-events-none absolute inset-0 bg-aurora" />
            <div className="relative">

              {!product ? (
                /* ─── No / invalid product — let them choose ─── */
                <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
                  <div className="mb-6 flex justify-center">
                    <span className="grid size-14 place-items-center rounded-2xl border border-border/70 bg-white shadow-brand">
                      <img src={LOGO_MARK_IMG} alt="AetherForge AI" className="h-[78%] w-[78%] object-contain" draggable={false} />
                    </span>
                  </div>
                  <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    Thank you for your purchase
                  </h1>
                  <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                    Choose the package you purchased to start your download.
                  </p>
                  <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500">
                      <Link href="/own-the-bots/success?product=stox">Download Stox</Link>
                    </Button>
                    <Button asChild size="lg" className="bg-amber-600 text-white hover:bg-amber-500">
                      <Link href="/own-the-bots/success?product=koins">Download Koins</Link>
                    </Button>
                  </div>
                  <p className="mt-6 text-xs text-muted-foreground">
                    Having trouble? Email support and we&apos;ll send your link directly.
                  </p>
                </section>
              ) : (
                <>
                  {/* ─── Hero / confirmation ─── */}
                  <section className="mx-auto max-w-3xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-20">
                    <Badge
                      variant="outline"
                      className="mb-5 border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800"
                    >
                      <PartyPopper className="mr-1.5 size-3.5 text-emerald-600" />
                      Purchase complete
                    </Badge>

                    <div className="mb-6 flex justify-center">
                      <div className="relative">
                        <div className={`absolute inset-0 rounded-full blur-2xl ${product.glow}`} aria-hidden />
                        <img
                          src={product.avatar}
                          alt={product.name}
                          className={`relative size-24 rounded-3xl object-cover ring-2 ${product.ring}`}
                          draggable={false}
                        />
                      </div>
                    </div>

                    <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                      Your <span className="text-gradient">{product.name}</span> engine is ready
                    </h1>
                    <p className={`mt-1.5 text-sm font-semibold ${product.text}`}>
                      {product.tagline} · {product.blurb}
                    </p>
                    <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                      Thank you — you now own {product.name} forever. Your protected, compiled
                      package is downloading below. Keep the file safe; you can re-download from
                      this page any time.
                    </p>

                    <div className="mt-8">
                      <DownloadPanel product={product} />
                    </div>
                  </section>

                  {/* ─── Getting started ─── */}
                  <section className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
                    <div className="rounded-3xl border border-border/70 bg-card/60 p-6 sm:p-8">
                      <h2 className="font-display text-lg font-bold tracking-tight sm:text-xl">
                        Get running in 3 steps
                      </h2>
                      <div className="mt-6 grid gap-5 sm:grid-cols-3">
                        {STEPS.map((s, i) => (
                          <div key={s.title} className="relative rounded-2xl border border-border/60 bg-background p-5">
                            <span className="absolute right-4 top-4 font-display text-2xl font-extrabold text-muted-foreground/20">
                              {i + 1}
                            </span>
                            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                              <s.icon className="size-5" />
                            </span>
                            <p className="mt-3 font-semibold leading-snug">{s.title}</p>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-2"><Cpu className="size-4 text-primary" /> Runs offline on your machine</span>
                        <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Compiled &amp; protected — no readable source</span>
                        <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-primary" /> One-time purchase · no subscription</span>
                      </div>
                      <p className="mt-4 text-xs text-muted-foreground">
                        The full step-by-step guide (<b>HOW-TO-USE.md</b>) is inside the package.
                        The engine requires the free <b>Node.js</b> runtime — the guide links you
                        straight to the installer.
                      </p>
                    </div>
                  </section>

                  {/* ─── Secondary ─── */}
                  <section className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6">
                    <p className="text-sm text-muted-foreground">Want the other engine too?</p>
                    <Button asChild variant="outline" className="mt-3">
                      <Link href="/own-the-bots">
                        Back to Own the Bots
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </section>
                </>
              )}

            </div>
          </div>
        </div>

        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
              <BrandLogo markClassName="size-9" wordmarkClassName="text-base" />
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                © {new Date().getFullYear()} AetherForge AI · Forge Intelligence Ltd. Your bot
                package is for informational use only and is not licensed financial advice.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
