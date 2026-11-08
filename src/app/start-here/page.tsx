import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { AppShell } from "@/components/AppShell";
import { FREE_PLAN, PRICING_TIERS } from "@/lib/plans";
import { formatNzd } from "@/lib/currency";
import { BROKER_LABEL } from "@/lib/import/formats";
import { dipCtaEnabled } from "@/lib/feature-flags";
import { DIP_CTA_CONFIG, dipCtaReady } from "@/lib/dip-cta";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/start-here", {
  title: "Start here · AetherForge AI",
  description: "A very simple guide to AetherForge AI for brand-new investors in New Zealand. Not financial advice.",
});

/**
 * b89 START-2: the plain-words guide. Every feature named here is live and not behind a flag:
 * dashboard tabs (Holdings, Transactions, Income & Tax, Insights), Record a transaction, /import,
 * Markets, Market News, the Stox and Koins reports and their Buy/Sell labels. Prices come from plans.ts.
 */
const IMPORT_BROKERS = (Object.keys(BROKER_LABEL) as Array<keyof typeof BROKER_LABEL>)
  .filter((k) => k !== "generic")
  .map((k) => BROKER_LABEL[k]);

function Step({ n, title, children, art }: { n: number; title: string; children: React.ReactNode; art: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-3xl border border-border/70 bg-card/60 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="mx-auto w-32 shrink-0 sm:mx-0" aria-hidden="true">
          {art}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-primary">Step {n}</p>
          <h2 id={`step-${n}`} className="mt-1 font-display text-xl font-bold sm:text-2xl">
            {title}
          </h2>
          <div className="mt-3 space-y-3 text-base leading-relaxed text-foreground">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* Simple shapes only. No photos, no people. */
const ArtSeed = (
  <svg viewBox="0 0 120 120" className="h-auto w-full">
    <circle cx="60" cy="60" r="56" className="fill-primary/10" />
    <rect x="30" y="80" width="60" height="18" rx="4" className="fill-amber-700/70" />
    <path d="M60 80 V45" strokeWidth="5" className="stroke-emerald-600" fill="none" />
    <ellipse cx="46" cy="50" rx="14" ry="8" className="fill-emerald-500" />
    <ellipse cx="74" cy="40" rx="14" ry="8" className="fill-emerald-500" />
  </svg>
);
const ArtScreen = (
  <svg viewBox="0 0 120 120" className="h-auto w-full">
    <circle cx="60" cy="60" r="56" className="fill-primary/10" />
    <rect x="22" y="30" width="76" height="54" rx="6" className="fill-card stroke-foreground/60" strokeWidth="3" />
    <polyline points="30,72 46,60 60,66 76,46 90,52" fill="none" strokeWidth="4" className="stroke-emerald-600" />
    <rect x="48" y="88" width="24" height="6" rx="2" className="fill-foreground/50" />
  </svg>
);
const ArtPlus = (
  <svg viewBox="0 0 120 120" className="h-auto w-full">
    <circle cx="60" cy="60" r="56" className="fill-primary/10" />
    <rect x="28" y="24" width="64" height="76" rx="6" className="fill-card stroke-foreground/60" strokeWidth="3" />
    <path d="M60 46 V78 M44 62 H76" strokeWidth="7" strokeLinecap="round" className="stroke-primary" />
  </svg>
);
const ArtTabs = (
  <svg viewBox="0 0 120 120" className="h-auto w-full">
    <circle cx="60" cy="60" r="56" className="fill-primary/10" />
    <rect x="16" y="36" width="22" height="12" rx="3" className="fill-primary" />
    <rect x="41" y="36" width="22" height="12" rx="3" className="fill-foreground/30" />
    <rect x="66" y="36" width="22" height="12" rx="3" className="fill-foreground/30" />
    <rect x="91" y="36" width="14" height="12" rx="3" className="fill-foreground/30" />
    <rect x="16" y="52" width="89" height="36" rx="4" className="fill-card stroke-foreground/60" strokeWidth="2" />
  </svg>
);
const ArtLabels = (
  <svg viewBox="0 0 120 120" className="h-auto w-full">
    <circle cx="60" cy="60" r="56" className="fill-primary/10" />
    <rect x="18" y="38" width="40" height="20" rx="10" className="fill-emerald-600" />
    <text x="38" y="52" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">BUY</text>
    <rect x="62" y="64" width="40" height="20" rx="10" className="fill-rose-600" />
    <text x="82" y="78" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">SELL</text>
  </svg>
);

export default async function StartHerePage() {
  const user = await getCurrentUser();
  const starter = PRICING_TIERS.find((t) => t.id === "starter");
  const pro = PRICING_TIERS.find((t) => t.id === "pro");
  const showDip = dipCtaReady(dipCtaEnabled());
  const cfg = DIP_CTA_CONFIG;

  const body = (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <p className="text-sm font-semibold text-primary">Start here</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">AetherForge, explained simply</h1>
      <p className="mt-3 text-lg leading-relaxed">
        Never invested before? That is fine. This page uses small words and one idea at a time. Read it top to bottom, or jump to a step.
      </p>
      <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-base font-semibold" data-nfa>
        This is general information, not financial advice. AetherForge does not buy or sell anything for you.
      </p>

      <nav aria-label="Steps on this page" className="mt-6">
        <ol className="grid gap-2 text-base sm:grid-cols-2">
          {["What investing is", "What this app shows you", "Adding what you own", "What each tab means", "What Buy and Sell labels mean"].map((t, i) => (
            <li key={t}>
              <a href={`#step-${i + 1}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
                {i + 1}. {t}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-6 grid gap-5">
        <Step n={1} title="What investing is" art={ArtSeed}>
          <p>Investing means putting money into something you hope will be worth more later. It is like planting a seed and waiting for it to grow.</p>
          <p>A <strong>share</strong> is a tiny piece of a company, such as one listed on the NZX in New Zealand or the ASX in Australia. A <strong>coin</strong> is a crypto asset, like Bitcoin. Gold and silver are metals people buy too.</p>
          <p>Prices go up <em>and</em> down. You can get back less than you put in. Only use money you can leave alone for a while.</p>
        </Step>

        <Step n={2} title="What this app shows you" art={ArtScreen}>
          <p>AetherForge is a tracker. You tell it what you own, and it shows you how it is doing, in NZ dollars (NZ$).</p>
          <p>It does not hold your money and it is not a broker. You buy and sell with your own broker or exchange, then write it down here.</p>
          <p>At the top of the dashboard you see <strong>Net worth</strong> (everything added up), <strong>Today</strong> (how much it moved today), <strong>Total return</strong> (how much you are up or down), <strong>Cash</strong> and <strong>Net contributions</strong> (money you put in, minus money you took out).</p>
        </Step>

        <Step n={3} title="Adding what you own" art={ArtPlus}>
          <p>
            <strong>One at a time:</strong> on the dashboard, press <strong>Record a transaction</strong>. Search for the share, coin, gold or silver, type how many and the price you paid, check it, then save.
          </p>
          <p>
            <strong>Lots at once:</strong> go to <Link href="/import" className="font-semibold text-primary underline">Import</Link> and upload the CSV file your broker gives you. You see everything before it is saved. Files from {IMPORT_BROKERS.join(", ")} are understood.
          </p>
          <p>Made a mistake? You can fix or remove a row later.</p>
        </Step>

        <Step n={4} title="What each tab means" art={ArtTabs}>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Holdings</strong>: the list of what you own, and what each one is worth now.</li>
            <li><strong>Transactions</strong>: every buy, sell, dividend and cash move you have written down.</li>
            <li><strong>Income &amp; Tax</strong>: dividend cash and the gains you have locked in by selling, by NZ tax year (ending 31 March). It is a summary of your own records only.</li>
            <li><strong>Insights</strong>: market signals, a market browser and the AI research report.</li>
          </ul>
          <p>
            Other pages: <Link href="/markets" className="font-semibold text-primary underline">Markets</Link> lists prices for NZX, ASX, US shares, crypto and DEX tokens. <Link href="/market-news" className="font-semibold text-primary underline">Market News</Link> shows recent headlines.
          </p>
        </Step>

        <Step n={5} title="What Buy and Sell labels mean" art={ArtLabels}>
          <p>The AI bots (<strong>Stox</strong> for shares, <strong>Koins</strong> for crypto) write research reports. On a report, each share or coin can have a small label:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><span className="rounded-full bg-emerald-700 px-2 py-0.5 text-sm font-bold text-white">Buy</span> means the bot&apos;s own 7-day guess is <strong>above</strong> today&apos;s price.</li>
            <li><span className="rounded-full bg-rose-700 px-2 py-0.5 text-sm font-bold text-white">Sell</span> means the bot&apos;s own 7-day guess is <strong>below</strong> today&apos;s price.</li>
            <li>No label means there is no guess, or the guess is almost the same as today.</li>
          </ul>
          <p className="font-semibold">A label is a computer&apos;s guess, not a promise and not advice. Guesses are often wrong. Decide for yourself.</p>
        </Step>
      </div>

      <section aria-labelledby="cost" className="mt-8 rounded-3xl border border-primary/40 bg-primary/5 p-5 sm:p-6">
        <h2 id="cost" className="font-display text-xl font-bold sm:text-2xl">What it costs</h2>
        <ul className="mt-3 space-y-2 text-base">
          <li><strong>Free</strong>: {formatNzd(0)}. Up to {FREE_PLAN.tickerLimit} holdings and {FREE_PLAN.reportsPerMonth} reports a month. No card needed.</li>
          {starter ? <li><strong>Starter</strong>: {formatNzd(starter.monthlyPrice ?? 0)} a month.</li> : null}
          {pro ? <li><strong>Pro</strong>: {formatNzd(pro.monthlyPrice ?? 0)} a month.</li> : null}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">All prices in NZ$. See <Link href="/pricing" className="font-semibold text-primary underline">Pricing</Link> for what each plan includes.</p>
        {showDip ? (
          <div data-dip-cta className="mt-4">
            <a href={cfg.href as string} className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">
              {cfg.label}
            </a>
            <p className="mt-2 text-sm">{cfg.whatYouGet}</p>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          {user ? (
            <Link href="/dashboard" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">Go to my dashboard</Link>
          ) : (
            <Link href="/register" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">Create a free account</Link>
          )}
          <Link href="/help" className="inline-flex min-h-12 items-center rounded-xl border border-border px-5 font-semibold">Get help</Link>
        </div>
      </section>

      <p className="mt-8 text-sm text-muted-foreground" data-nfa-footer>
        AetherForge AI gives general information only. It is not financial advice and does not consider your situation. Investing can lose money.
      </p>
    </main>
  );

  if (!user) return <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>{body}</AppShell>;
  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image, subscription_status: user.subscription_status, subscription_plan: user.subscription_plan }}
    >
      {body}
    </AppShell>
  );
}
