import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { MarketTicker } from "@/components/MarketTicker";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const BOTS = [
  {
    name: "Stox",
    role: "Stock markets",
    img: "/brand/bot-stox-fullbody.png",
    blurb: "STOX monitors the Stock Market with Ultra Advanced analysis and reports tied to your portfolio.",
  },
  {
    name: "Koins",
    role: "Crypto markets",
    img: "/brand/bot-koins-fullbody.png",
    blurb: "KOINS monitors the Crypto Currency World and surfaces what matters for your holdings.",
  },
  {
    name: "The Headmaster",
    role: "Goals & strategy",
    img: "/brand/bot-headmaster-fullbody.png",
    blurb: "The Headmaster builds an investment plan and strategy with you, tailored to what your individual needs require.",
  },
] as const;

const STEPS = [
  {
    title: "Create Your Account",
    body: "Sign up in seconds, Choose a Plan - Go monthly or yearly, cancel anytime",
    sitter: {
      name: "Stox",
      img: "/brand/bot-stox-fullbody.png",
      wrap: "left-0 -rotate-6",
      imgClass: "h-36 w-auto",
    },
  },
  {
    title: "Add your holdings",
    body: "Enter into Dashboard section your current Stock Market or Crypto Market Investments, Enter Your Precious Metals Investment",
    sitter: {
      name: "Smitty",
      img: "/brand/bot-smitty-sitter.png",
      wrap: "right-1 rotate-2",
      imgClass: "h-40 w-auto",
    },
  },
  {
    title: "Meet the AI bots",
    body: "Go to The Headmaster AI bot, Set Your Goals, Create a Strategy suitable to Your Needs and Requirements",
    sitter: {
      name: "The Headmaster",
      img: "/brand/bot-headmaster-fullbody.png",
      wrap: "left-1/2 -translate-x-1/2 -rotate-2",
      imgClass: "h-40 w-auto",
    },
  },
  {
    title: "Use Stox and Koins",
    body: "Generate daily reports using Stox and Koins AI bots, they monitor the entire markets, Analyze ALL of the REAL LIVE Data, and make Data Backed Short Term Predictions that will help you navigate your way towards achieving your Goals set with The Headmaster",
    sitter: {
      name: "Koins",
      img: "/brand/bot-koins-fullbody.png",
      wrap: "right-0 rotate-7",
      imgClass: "h-36 w-auto",
    },
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <MarketTicker />
      <main className="flex-1">
        <div className="chrome-dark relative min-h-screen bg-background bg-grid">
          <div className="pointer-events-none absolute inset-0 bg-aurora" />
          <div className="relative">
            {/* Hero */}
            <section className="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8">
              <div className="grid items-center gap-12 lg:grid-cols-2">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    Live NZX · ASX · Crypto · Metals intelligence
                  </div>
                  <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight text-amber-400 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
                    Data Backed Market Intelligence straight to You
                  </h1>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    Powered by SuperGrok 4.6. Track stocks, crypto and precious metals,
                    then let Stox, Koins and The Headmaster turn live data into a plan
                    you can actually use.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <Button asChild className="h-12 px-7 text-base shadow-glow">
                      <Link href="/register">
                        Start free
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-12 px-7 text-base border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                      <Link href="/dashboard">Open Dashboard</Link>
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-amber-400/10 blur-2xl" />
                  <img
                    src="/brand/home-hero-portfolio.png"
                    alt="Stock Portfolio Overview dashboard"
                    className="relative w-full h-auto rounded-3xl border border-border/70 bg-card shadow-xl"
                  />
                </div>
              </div>
            </section>

            {/* Three bots — one tidy section */}
            <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-3xl text-center">
                <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  The core of AetherForge
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  3 Genius AI bots to do the Thinking for You
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Powered by SuperGrok 4.6, STOX monitors the Stock Market, KOINS monitors
                  the Crypto Currency World, and The Headmaster will make an investment
                  plan and strategy with You, tailored to What your Individual needs
                  require. Then using Koins and Stox indepth Ultra Advanced Analysis and
                  Reports on everything that is relative to your portfolio, Manage your
                  Investment Portfolio with the minimal amout of work required from you,
                  leaving you free time to do other things.
                </p>
              </div>
              <div className="mt-10 grid gap-5 sm:grid-cols-3">
                {BOTS.map((bot) => (
                  <article
                    key={bot.name}
                    className="flex h-full flex-col rounded-3xl border border-border/70 bg-card/60 p-5 shadow-sm"
                  >
                    <img
                      src={bot.img}
                      alt={`${bot.name} avatar`}
                      className="mx-auto h-28 w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
                    />
                    <h3 className="mt-4 text-center font-display text-lg font-bold text-amber-400">
                      {bot.name}
                    </h3>
                    <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-primary">
                      {bot.role}
                    </p>
                    <p className="mt-3 flex-1 text-center text-sm leading-relaxed text-muted-foreground">
                      {bot.blurb}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            {/* Precious metals — replaces Institutional Edge / Capabilities */}
            <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <h2 className="mb-8 text-center font-display text-4xl font-extrabold tracking-tight text-amber-400 sm:text-5xl">
                Precious Metals
              </h2>
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <img
                  src="/brand/precious-metals-smitty.png"
                  alt="Smitty, AetherForge Precious Metals Manager, with gold and silver at the forge"
                  className="w-full h-auto rounded-3xl border border-border/70 shadow-xl"
                />
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
                    Ultra Advanced · Precious metals
                  </p>
                  <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6">
                    <div className="min-w-0 flex-1 order-2 sm:order-1">
                      <p className="font-display text-lg font-bold text-amber-300">Smitty</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#a89c86]">
                        Precious Metals Manager
                      </p>
                      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                        Gold and silver — investment, currency, and a safe haven
                      </h2>
                      <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                        Meet Smitty — AetherForge AI&apos;s Precious Metals Manager. He understands how much precious metals mean to the
                        world — as investments, as a globally accepted currency, and in
                        times of need as safe investments. We surface daily live Silver and
                        Gold prices with inclines and declines so you can track the metals
                        that matter.
                      </p>
                    </div>
                    <img
                      src="/brand/bot-smitty-fullbody.png"
                      alt="Smitty leaning on a stack of gold bars"
                      className="order-1 mx-auto h-56 w-auto shrink-0 drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)] sm:order-2 sm:mx-0 sm:h-64"
                    />
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                        Gold · XAU
                      </p>
                      <p className="mt-1 font-display text-xl font-bold text-amber-400">Live Daily Prices</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Inclines &amp; declines shown on your Dashboard
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-400/30 bg-slate-400/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                        Silver · XAG
                      </p>
                      <p className="mt-1 font-display text-xl font-bold text-amber-400">Live Daily Prices</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Inclines &amp; declines shown on your Dashboard
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Simple path */}
            <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-2xl text-center">
                <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  Simple path
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  Four steps to get started
                </h2>
              </div>
              <div className="mt-20 grid gap-x-5 gap-y-20 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((step, idx) => (
                  <article
                    key={step.title}
                    className="relative flex h-full flex-col overflow-visible rounded-3xl border border-border/70 bg-card/60 p-5 pt-14"
                  >
                    {/* Avatar perched on the card — legs hang over the top edge */}
                    <div
                      className={`pointer-events-none absolute top-0 z-10 -translate-y-[62%] ${step.sitter.wrap}`}
                      aria-hidden
                    >
                      <img
                        src={step.sitter.img}
                        alt=""
                        className={`${step.sitter.imgClass} max-w-none object-contain object-bottom drop-shadow-[0_16px_24px_rgba(0,0,0,0.6)]`}
                      />
                    </div>
                    <span className="relative z-0 font-display text-sm font-bold text-primary">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <h3 className="relative z-0 mt-3 font-display text-lg font-bold leading-snug text-primary">
                      {step.title}
                    </h3>
                    <p className="relative z-0 mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            {/* CTA */}
            <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
              <div className="rounded-3xl border border-primary/30 bg-primary/10 px-6 py-12 text-center sm:px-10">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Ready to take care of your Portfolio?
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                  Create your account, add your holdings, and let the bots do the heavy
                  thinking.
                </p>
                <Button asChild className="mt-8 h-12 px-8 text-base shadow-glow">
                  <Link href="/register">
                    Start free
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
