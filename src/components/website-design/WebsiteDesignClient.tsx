"use client";

import { useEffect, useState } from "react";
import { WEBSITE_DESIGN_LIVE_SHOT } from "../../../assets/files";
import { formatUsdApprox } from "@/lib/currency";
import { useFxRates } from "@/hooks/useFxRates";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  Layout,
  Bot,
  Code2,
  ShieldCheck,
  LayoutDashboard,
  Layers,
  MessageSquare,
  Users,
  Gauge,
  Search,
  Smartphone,
  PenTool,
  Rocket,
  Menu,
  X,
  Mail,
  ExternalLink,
  Facebook,
  Linkedin,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Data                                                                       */
/* -------------------------------------------------------------------------- */

const LIVE_SITE_URL = "https://www.aetherforgeai.co.nz";

const CONTACT = {
  email: "admin@aetherforgeai.co.nz",
  facebook: "https://www.facebook.com/profile.php?id=61591701002008",
  x: "https://x.com/aetherforgeAi_",
  linkedin: "https://www.linkedin.com/in/aether-forge-ai-27659b423/",
};

type Capability = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const CAPABILITIES: Capability[] = [
  {
    icon: Layout,
    title: "Professional website design",
    body: "Beautifully composed, fully responsive websites — considered typography, generous space and a refined finish that makes a business look genuinely world-class.",
  },
  {
    icon: Bot,
    title: "Custom Python AI bots",
    body: "Bespoke AI assistants and automation, built in Python and woven directly into your site. Available on request and tailored precisely to how your business works.",
  },
  {
    icon: Code2,
    title: "Advanced coding, anything possible",
    body: "Portals, dashboards, live data, integrations, bespoke tooling — advanced engineering that turns an ambitious brief into a site that simply works.",
  },
];

type PackageTier = {
  key: "standard" | "premium" | "ultimate";
  name: string;
  tagline: string;
  priceNzd: number;
  priceNote: string;
  paymentLink: string;
  ctaLabel: string;
  featured?: boolean;
  ribbon?: string;
  features: { icon: React.ComponentType<{ className?: string }>; label: string }[];
};

const PACKAGES: PackageTier[] = [
  {
    key: "standard",
    name: "Standard Professional",
    tagline: "A clean, polished company website that earns instant trust.",
    priceNzd: 1500,
    priceNote: "one-time · complete build",
    paymentLink: "https://buy.stripe.com/bJedR34In4ZN2PJ1b11440o",
    ctaLabel: "Begin the Standard build",
    features: [
      { icon: Layout, label: "Multi-page site — Home, About Us, Expertise, Contact" },
      { icon: Smartphone, label: "Fully responsive across every device" },
      { icon: Gauge, label: "Fast-loading, performance-tuned pages" },
      { icon: Search, label: "SEO-ready foundation, built in from day one" },
      { icon: PenTool, label: "Refined, on-brand visual design" },
    ],
  },
  {
    key: "premium",
    name: "Premium Business",
    tagline: "Everything polished, plus a private, members-only experience.",
    priceNzd: 3500,
    priceNote: "one-time · complete build",
    paymentLink: "https://buy.stripe.com/dRm4gta2H4ZNeyr6vl1440p",
    ctaLabel: "Begin the Premium build",
    featured: true,
    ribbon: "Most popular",
    features: [
      { icon: Check, label: "Everything in Standard Professional" },
      { icon: ShieldCheck, label: "Secure customer login portal" },
      { icon: Users, label: "Members-only area for your clients" },
      { icon: LayoutDashboard, label: "Clean, intuitive dashboard experience" },
    ],
  },
  {
    key: "ultimate",
    name: "Ultimate Custom",
    tagline: "A fully bespoke build — no limits, tailored entirely to your brief.",
    priceNzd: 7500,
    priceNote: "project deposit · fully bespoke",
    paymentLink: "https://buy.stripe.com/9B63cpeiXbobeyrdXN1440q",
    ctaLabel: "Commission an Ultimate build",
    ribbon: "Bespoke",
    features: [
      { icon: Layers, label: "Multiple, elegantly interconnected pages" },
      { icon: Layout, label: "Expandable preview windows that open pages in-place" },
      { icon: Bot, label: "Integrated AI chatbot, tuned to your business" },
      { icon: Users, label: "Dual portals — Customer login & Staff login" },
      { icon: Code2, label: "Advanced, fully custom functionality" },
      { icon: Sparkles, label: "Anything else your brief requires" },
    ],
  },
];

const PROCESS = [
  {
    icon: MessageSquare,
    step: "01",
    title: "Discover",
    body: "We talk through your goals, audience and the impression you want to make. Every build starts with clarity.",
  },
  {
    icon: PenTool,
    step: "02",
    title: "Design",
    body: "A considered visual direction — typography, colour and layout crafted to feel unmistakably yours.",
  },
  {
    icon: Code2,
    step: "03",
    title: "Build",
    body: "Clean, fast, modern code. Portals, AI and integrations engineered to work flawlessly.",
  },
  {
    icon: Rocket,
    step: "04",
    title: "Launch",
    body: "Polished, tested and published — with the same care you can see on my own live site.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function WebsiteDesignClient() {
  const { rates: fx } = useFxRates();
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Lock body scroll while the live-site preview modal is open.
  useEffect(() => {
    if (previewOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [previewOpen]);

  const nav = [
    { href: "#work", label: "Work" },
    { href: "#services", label: "Services" },
    { href: "#packages", label: "Packages" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <main
      className="min-h-screen bg-[#F7F1E8] text-[#2B2724] antialiased selection:bg-[#C8A96A]/30"
      style={{ fontFamily: "var(--font-studio-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* ------------------------------------------------------------------ */}
      {/*  Header                                                            */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-[#E6D9C4]/70 bg-[#F7F1E8]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="#top" className="group flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full border border-[#C8A96A]/60 bg-[#FFFDF9] text-[#9A7B44]">
              <PenTool className="size-4" />
            </span>
            <span
              className="text-lg tracking-wide text-[#2B2724]"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Website Design
            </span>
          </a>

          <nav className="hidden items-center gap-9 md:flex">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-sm font-medium tracking-wide text-[#6B6152] transition-colors hover:text-[#9A7B44]"
              >
                {n.label}
              </a>
            ))}
            <a
              href="#packages"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2B2724] px-5 py-2.5 text-sm font-medium text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
            >
              Start your project <ArrowRight className="size-3.5" />
            </a>
          </nav>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-full border border-[#E6D9C4] text-[#6B6152] md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-[#E6D9C4]/70 bg-[#F7F1E8] px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-1">
              {nav.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-3 text-sm font-medium text-[#6B6152] hover:bg-[#EFE4D2] hover:text-[#9A7B44]"
                >
                  {n.label}
                </a>
              ))}
              <a
                href="#packages"
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2B2724] px-5 py-3 text-sm font-medium text-[#F7F1E8]"
              >
                Start your project <ArrowRight className="size-3.5" />
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  Hero                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section id="top" className="relative overflow-hidden">
        {/* soft warm glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 78% 8%, rgba(200,169,106,0.20), transparent 60%), radial-gradient(50% 45% at 8% 92%, rgba(197,123,87,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C8A96A]/50 bg-[#FFFDF9]/70 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-[#9A7B44]">
              <Sparkles className="size-3.5" /> Premium website design studio
            </span>

            <h1
              className="mt-7 text-[2.7rem] leading-[1.05] text-[#211E1B] sm:text-6xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Websites crafted to
              <span className="block italic text-[#9A7B44]">look world-class</span>
              and quietly convert.
            </h1>

            <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-[#5C5346]">
              I design and build refined, results-driven websites for businesses that care about
              the impression they make — from polished company sites to secure customer portals,
              integrated AI and fully bespoke builds. Elegant on the surface, seriously capable
              underneath.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="#packages"
                className="inline-flex items-center gap-2 rounded-full bg-[#2B2724] px-7 py-3.5 text-sm font-medium tracking-wide text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
              >
                View packages <ArrowRight className="size-4" />
              </a>
              <a
                href="#work"
                className="inline-flex items-center gap-2 rounded-full border border-[#CDBEA3] px-7 py-3.5 text-sm font-medium tracking-wide text-[#4A4237] transition-colors hover:border-[#9A7B44] hover:text-[#9A7B44]"
              >
                See live work
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm font-light text-[#6B6152]">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#9A7B44]" /> Fully responsive
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#9A7B44]" /> SEO-ready
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#9A7B44]" /> Built to convert
              </span>
            </div>
          </div>

          {/* Framed live-site showcase */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#C8A96A]/25 via-transparent to-[#C57B57]/15 blur-2xl"
            />
            <figure className="relative overflow-hidden rounded-[1.6rem] border border-[#E6D9C4] bg-[#FFFDF9] p-3 shadow-[0_30px_60px_-25px_rgba(43,39,36,0.35)]">
              <div className="overflow-hidden rounded-[1.15rem] border border-[#EFE4D2]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={WEBSITE_DESIGN_LIVE_SHOT}
                  alt="Live website designed and built by the studio — aetherforgeai.co.nz"
                  className="block w-full"
                />
              </div>
              <figcaption className="flex items-center justify-between px-2 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.15em] text-[#9A7B44]">
                  Live client site
                </span>
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A4237] transition-colors hover:text-[#9A7B44]"
                >
                  Preview in-page <ArrowUpRight className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Work / live example                                               */}
      {/* ------------------------------------------------------------------ */}
      <section id="work" className="border-y border-[#E6D9C4]/70 bg-[#FBF6EE]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:py-24 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="overflow-hidden rounded-[1.4rem] border border-[#E6D9C4] bg-[#FFFDF9] p-2.5 shadow-[0_24px_50px_-28px_rgba(43,39,36,0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={WEBSITE_DESIGN_LIVE_SHOT}
                alt="AetherForge AI — a live, production website designed and built in-house"
                className="block w-full rounded-[1rem] border border-[#EFE4D2]"
              />
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
              Proof, not promises
            </span>
            <h2
              className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              My own live site is the reference.
            </h2>
            <p className="mt-5 text-lg font-light leading-relaxed text-[#5C5346]">
              <span className="font-medium text-[#4A4237]">aetherforgeai.co.nz</span> is a real,
              working product I designed and built end-to-end — live market data, secure logins, a
              members dashboard and integrated AI. The same standard of craft goes into every
              website I create for a client.
            </p>

            <ul className="mt-7 space-y-3">
              {[
                "Designed, coded and shipped to production",
                "Live data, secure portals and integrated AI",
                "Fast, responsive and built to the finest detail",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[#5C5346]">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-[#C8A96A]/20 text-[#9A7B44]">
                    <Check className="size-3" />
                  </span>
                  <span className="font-light">{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href={LIVE_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#2B2724] px-6 py-3 text-sm font-medium text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
              >
                Visit the live site <ExternalLink className="size-4" />
              </a>
              <button
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-[#CDBEA3] px-6 py-3 text-sm font-medium text-[#4A4237] transition-colors hover:border-[#9A7B44] hover:text-[#9A7B44]"
              >
                Preview without leaving <ArrowUpRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Services / capabilities                                           */}
      {/* ------------------------------------------------------------------ */}
      <section id="services" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
            What I do
          </span>
          <h2
            className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            Design taste, engineering depth.
          </h2>
          <p className="mt-5 text-lg font-light leading-relaxed text-[#5C5346]">
            A rare combination — the eye of a designer with the capability of an advanced developer,
            so nothing about your ambition has to be compromised.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="group rounded-2xl border border-[#E6D9C4] bg-[#FFFDF9] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#C8A96A]/70 hover:shadow-[0_24px_45px_-28px_rgba(154,123,68,0.5)]"
            >
              <span className="grid size-12 place-items-center rounded-xl bg-[#C8A96A]/15 text-[#9A7B44] transition-colors group-hover:bg-[#C8A96A]/25">
                <c.icon className="size-6" />
              </span>
              <h3
                className="mt-6 text-2xl text-[#211E1B]"
                style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
              >
                {c.title}
              </h3>
              <p className="mt-3 font-light leading-relaxed text-[#5C5346]">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Packages                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="packages" className="border-y border-[#E6D9C4]/70 bg-[#FBF6EE]">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
              Packages
            </span>
            <h2
              className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Three ways to begin.
            </h2>
            <p className="mt-5 text-lg font-light leading-relaxed text-[#5C5346]">
              Clear, considered options — from a polished company site to a fully bespoke build.
              Secure payment is handled by Stripe; every project starts the moment you&apos;re ready.
            </p>
          </div>

          <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.key}
                className={[
                  "relative flex h-full flex-col rounded-[1.4rem] border p-8 transition-all duration-300",
                  pkg.featured
                    ? "border-[#C8A96A] bg-[#FFFDF9] shadow-[0_34px_70px_-32px_rgba(154,123,68,0.55)] lg:-mt-4 lg:mb-4 lg:pb-11"
                    : "border-[#E6D9C4] bg-[#FFFDF9]/70 hover:border-[#C8A96A]/70 hover:shadow-[0_24px_50px_-30px_rgba(43,39,36,0.4)]",
                ].join(" ")}
              >
                {pkg.ribbon && (
                  <span
                    className={[
                      "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]",
                      pkg.featured
                        ? "bg-[#2B2724] text-[#F7F1E8]"
                        : "border border-[#C8A96A]/50 bg-[#FFFDF9] text-[#9A7B44]",
                    ].join(" ")}
                  >
                    {pkg.ribbon}
                  </span>
                )}

                <h3
                  className="text-2xl text-[#211E1B]"
                  style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
                >
                  {pkg.name}
                </h3>
                <p className="mt-2 min-h-[3rem] font-light leading-relaxed text-[#6B6152]">
                  {pkg.tagline}
                </p>

                {/* Price — NZD primary, live US$ underneath */}
                <div className="mt-6 border-t border-[#EFE4D2] pt-6">
                  <div className="flex items-end gap-1.5">
                    <span className="text-xl font-medium text-[#8A7E6E]">NZ$</span>
                    <span
                      className="text-5xl leading-none text-[#211E1B]"
                      style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 700 }}
                    >
                      {pkg.priceNzd.toLocaleString("en-NZ")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-light text-[#8A7E6E]">
                    {formatUsdApprox(pkg.priceNzd, fx)} today · {pkg.priceNote}
                  </p>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {pkg.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-3 text-[#5C5346]">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#C8A96A]/18 text-[#9A7B44]">
                        <f.icon className="size-3" />
                      </span>
                      <span className="font-light leading-snug">{f.label}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={pkg.paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={[
                    "mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium tracking-wide transition-colors",
                    pkg.featured
                      ? "bg-[#2B2724] text-[#F7F1E8] hover:bg-[#9A7B44]"
                      : "border border-[#2B2724]/80 text-[#2B2724] hover:border-[#9A7B44] hover:bg-[#9A7B44] hover:text-[#F7F1E8]",
                  ].join(" ")}
                >
                  {pkg.ctaLabel} <ArrowRight className="size-4" />
                </a>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm font-light leading-relaxed text-[#8A7E6E]">
            All prices are in New Zealand Dollars (NZD) and processed securely through Stripe. US$
            figures are indicative at today&apos;s exchange rate. Not sure which fits? Just{" "}
            <a href="#contact" className="font-medium text-[#9A7B44] underline underline-offset-4">
              get in touch
            </a>{" "}
            and we&apos;ll find the right path together.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Process                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#9A7B44]">
            How it works
          </span>
          <h2
            className="mt-4 text-4xl leading-tight text-[#211E1B] sm:text-5xl"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            A calm, considered process.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((p) => (
            <div
              key={p.step}
              className="rounded-2xl border border-[#E6D9C4] bg-[#FFFDF9] p-7"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-[#C8A96A]/15 text-[#9A7B44]">
                  <p.icon className="size-5" />
                </span>
                <span
                  className="text-2xl text-[#E0CFB0]"
                  style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 700 }}
                >
                  {p.step}
                </span>
              </div>
              <h3
                className="mt-5 text-xl text-[#211E1B]"
                style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
              >
                {p.title}
              </h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-[#5C5346]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Contact                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section id="contact" className="border-t border-[#E6D9C4]/70 bg-[#2B2724] text-[#F2E9DA]">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#C8A96A]">
            Let&apos;s begin
          </span>
          <h2
            className="mt-4 text-4xl leading-tight text-[#FBF6EE] sm:text-5xl"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            Ready to build something exceptional?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg font-light leading-relaxed text-[#C9BCA6]">
            Tell me about your business and what you have in mind. I reply personally, and I&apos;d
            love to help you make a genuinely lasting impression.
          </p>

          <a
            href={`mailto:${CONTACT.email}`}
            className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-[#C8A96A] px-8 py-4 text-sm font-medium tracking-wide text-[#2B2724] transition-colors hover:bg-[#D8BC80]"
          >
            <Mail className="size-4" /> {CONTACT.email}
          </a>

          <div className="mt-12 flex items-center justify-center gap-4">
            <a
              href={CONTACT.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="grid size-12 place-items-center rounded-full border border-[#C8A96A]/40 text-[#E9DDC8] transition-colors hover:border-[#C8A96A] hover:bg-[#C8A96A]/15 hover:text-[#FBF6EE]"
            >
              <Facebook className="size-5" />
            </a>
            <a
              href={CONTACT.x}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (formerly Twitter)"
              className="grid size-12 place-items-center rounded-full border border-[#C8A96A]/40 text-[#E9DDC8] transition-colors hover:border-[#C8A96A] hover:bg-[#C8A96A]/15 hover:text-[#FBF6EE]"
            >
              {/* X wordmark glyph */}
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
              </svg>
            </a>
            <a
              href={CONTACT.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="grid size-12 place-items-center rounded-full border border-[#C8A96A]/40 text-[#E9DDC8] transition-colors hover:border-[#C8A96A] hover:bg-[#C8A96A]/15 hover:text-[#FBF6EE]"
            >
              <Linkedin className="size-5" />
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="bg-[#211E1B] text-[#9A8F7D]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <span
            className="text-base text-[#E9DDC8]"
            style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
          >
            Website Design
          </span>
          <p className="text-xs font-light tracking-wide">
            Designed &amp; built with care · Powered by secure Stripe payments
          </p>
        </div>
      </footer>

      {/* ------------------------------------------------------------------ */}
      {/*  Live-site preview modal (demonstrates the "preview window" idea)  */}
      {/* ------------------------------------------------------------------ */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1714]/70 p-4 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#C8A96A]/40 bg-[#FFFDF9] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E6D9C4] px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-[#6B6152]">
                <span className="size-2.5 rounded-full bg-[#C57B57]/70" />
                <span className="size-2.5 rounded-full bg-[#C8A96A]/70" />
                <span className="size-2.5 rounded-full bg-[#9AAE86]/70" />
                <span className="ml-3 font-light">aetherforgeai.co.nz</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={LIVE_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9A7B44] hover:underline"
                >
                  Open in new tab <ExternalLink className="size-3.5" />
                </a>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="grid size-8 place-items-center rounded-full text-[#6B6152] hover:bg-[#EFE4D2]"
                  aria-label="Close preview"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <iframe
              src={LIVE_SITE_URL}
              title="Live preview — aetherforgeai.co.nz"
              className="h-full w-full flex-1 bg-white"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </main>
  );
}
