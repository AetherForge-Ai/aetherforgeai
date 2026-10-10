import Link from "next/link";
import { LEGAL_ENTITY_NAME } from "@/lib/company";
import { BOT_COUNT_LINE, PAPER_BOOK_STATEMENT, SMITTY_ROLE_LINE } from "@/lib/public-copy";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { SiteHeader } from "@/components/SiteHeader";
import { MarketTicker } from "@/components/MarketTicker";
import { HomeBottomCta, HomeHeroCtas } from "@/components/home/HomeSessionCtas";
import { PersonalGuide } from "@/components/personal-guide";
import { HomeMetalsPrices } from "@/components/home/HomeMetalsPrices";

export const metadata = publicPageMetadata("/", {
  title: "AetherForge AI — Intelligent Market Analysis",
  description:
    "AetherForge AI is market intelligence for a paper portfolio: NZX, ASX and global markets, with AI research on the positions you enter. Not a broker, and not financial advice.",
});

const BOTS = [
  {
    name: "Stox",
    role: "Stock markets",
    img: "/brand/bot-stox-fullbody.png",
    blurb: "Stox reads stock markets and writes reports about the holdings on your book.",
  },
  {
    name: "Koins",
    role: "Crypto markets",
    img: "/brand/bot-koins-fullbody.png",
    blurb: "Koins reads crypto markets and writes notes about the coins on your book.",
  },
  {
    name: "The Headmaster",
    role: "Goals & strategy",
    img: "/brand/bot-headmaster-fullbody.png",
    blurb: "The Headmaster sets out a goal plan you can read across the book. It is information, not personalised advice.",
  },
] as const;

const STEPS = [
  {
    title: "Create Your Account",
    body: "Open a free account and look through the product before you choose a paid plan.",
    sitter: {
      name: "Stox",
      img: "/brand/bot-stox-fullbody.png",
      wrap: "left-0 -rotate-6",
      imgClass: "h-36 w-auto",
    },
  },
  {
    title: "Add your holdings",
    body: "Add the stocks, crypto, or metals you want on the paper book. A CSV of ticker, units, and price paid can be imported as well.",
    sitter: {
      name: "Smitty",
      img: "/brand/bot-smitty-holdings.png",
      wrap: "left-2",
      imgClass: "h-44 w-auto origin-bottom-left",
      place: "bottom" as const,
    },
  },
  {
    title: "Meet the AI bots",
    body: "Open The Headmaster and record the goals you want to read the book against. The plan is information. It is not personalised advice.",
    sitter: {
      name: "The Headmaster",
      img: "/brand/bot-headmaster-fullbody.png",
      wrap: "left-1/2 -translate-x-1/2 -rotate-2",
      imgClass: "h-40 w-auto",
    },
  },
  {
    title: "Use Stox and Koins",
    body: "When prices are available, Stox and Koins write illustrative scenarios from those prices. You compare them with the goals you set. You still decide, and any trade is placed at your own broker.",
    sitter: {
      name: "Koins",
      img: "/brand/bot-koins-fullbody.png",
      wrap: "right-0 rotate-7",
      imgClass: "h-36 w-auto",
    },
  },
] as const;

export default async function LandingPage() {
  const tape = await loadPublicTickerBounded();
  return (
    <div className="min-h-screen flex flex-col">
      <PersonalGuide />
      <SiteHeader />
      <MarketTicker initial={tape} />
      <main className="flex-1">
        <div className="chrome-dark relative min-h-screen bg-background bg-grid">
          <div className="pointer-events-none absolute inset-0 bg-aurora" />
          <div className="relative">
            {/* Hero */}
            <section className="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8">
              <div className="grid items-center gap-12 lg:grid-cols-2">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    NZX · ASX · Crypto · Metals
                  </div>
                  <h1 className="mt-5 font-grift-black text-4xl tracking-tight text-amber-400 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
                    Market intelligence for the book you hold
                  </h1>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    Track stocks, crypto and precious metals,
                    then use Stox, Koins and The Headmaster to turn market data into
                    illustrative scenarios and a goal plan. {PAPER_BOOK_STATEMENT}
                  </p>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Not financial advice. {LEGAL_ENTITY_NAME} is not a licensed financial
                    advice provider, and we don&apos;t place trades or take custody.{" "}
                    <Link href="/ai-disclaimer" className="font-medium text-primary hover:underline">
                      AI disclaimer
                    </Link>
                    .
                  </p>
                  <HomeHeroCtas />
                </div>
                <div className="relative">
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-amber-400/10 blur-2xl" />
                  <img
                    src="/brand/home-hero-portfolio.png"
                    alt="Example screen of a paper portfolio overview"
                    className="relative w-full h-auto rounded-3xl border border-border/70 bg-card shadow-xl"
                  />
                  <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-zinc-950/80 px-3 py-1 text-xs font-semibold text-white">
                    Example screen
                  </span>
                </div>
              </div>
            </section>

            {/* Three bots — one tidy section */}
            <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-3xl text-center">
                <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  The core of AetherForge
                </p>
                <h2 className="mt-3 font-grift-black text-3xl tracking-tight text-amber-400 sm:text-4xl">
                  {BOT_COUNT_LINE}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Stox monitors stock markets, Koins monitors
                  crypto, and The Headmaster is the goal-planning bot — it builds a plan
                  with you from the goals you set. Reports are informational scenarios about
                  what is on your book. AetherForge does not trade for you and does not hold
                  your assets. {SMITTY_ROLE_LINE}{" "}
                  <Link href="/ai-disclaimer" className="font-medium text-primary hover:underline">
                    Read the AI disclaimer
                  </Link>
                  .
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

            {/* Precious metals */}
            <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <h2 className="text-center font-grift-black text-4xl tracking-tight text-amber-400 sm:text-5xl">
                Precious Metals
              </h2>
              <div className="mt-4 mb-8 text-center">
                <p className="font-grift-black text-3xl tracking-tight text-amber-300 sm:text-4xl">
                  Smitty
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#a89c86]">
                  Spot and holdings tracker
                </p>
              </div>

              <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10">
                {/* Large forge image + Au/Ag cards centred under it */}
                <div className="flex flex-col">
                  <img
                    src="/brand/precious-metals-smitty.png"
                    alt="Smitty with gold and silver at the forge"
                    className="w-full h-auto rounded-3xl border border-border/70 shadow-xl"
                  />
                  <HomeMetalsPrices />
                </div>

                {/* Copy + cutout, top-aligned with large image */}
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
                  <div className="min-w-0 flex-1 order-2 sm:order-1">
                    <h3 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                      Gold and silver — investment, currency, and a safe haven
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                      Meet Smitty — AetherForge AI&apos;s precious-metals tracker. When the spot feed answers, the gold and silver figures here match the figures on Smitty, including the time they were taken. If the feed fails, the cards say so. This desk does not run a separate report.
                    </p>
                  </div>
                  <img
                    src="/brand/bot-smitty-fullbody.png"
                    alt="Smitty leaning on a stack of gold bars"
                    className="order-1 mx-auto h-56 w-auto shrink-0 drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)] sm:order-2 sm:mx-0 sm:h-64"
                  />
                </div>
              </div>
            </section>

            {/* How to get started */}
            <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-grift-black text-3xl tracking-tight text-amber-400 sm:text-4xl">
                  Here's how to get started
                </h2>
              </div>
              <div className="mt-20 grid gap-x-5 gap-y-20 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((step, idx) => (
                  <article
                    key={step.title}
                    className={`relative flex h-full flex-col overflow-visible rounded-3xl border border-border/70 bg-card/60 p-5 ${
                      "place" in step.sitter && step.sitter.place === "bottom" ? "pb-28 pt-5" : "pt-14"
                    }`}
                  >
                    {/* Avatar: top perch or standing under the card */}
                    <div
                      className={`pointer-events-none absolute z-10 ${
                        "place" in step.sitter && step.sitter.place === "bottom"
                          ? `bottom-0 translate-y-[48%] ${step.sitter.wrap}`
                          : `top-0 -translate-y-[62%] ${step.sitter.wrap}`
                      }`}
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
                    <h3 className="relative z-0 mt-3 font-grift-regular text-lg leading-snug text-amber-400">
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
                <h2 className="font-grift-black text-3xl tracking-tight text-amber-400 sm:text-4xl">
                  Ready to take care of your Portfolio?
                </h2>

                <HomeBottomCta />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
